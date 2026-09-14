from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

import numpy as np
import pandas as pd
import xarray as xr
from dotenv import load_dotenv

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

import copernicusmarine

from data_pipeline.config import (
    BALTIC_REGION,
    BBOX,
    COPERNICUS_PASSWORD_ENV_VARS,
    COPERNICUS_USERNAME_ENV_VARS,
    INITIAL_VIEW,
    LAND_MASK_FILENAME,
    MAX_RUNNER_RAM_GB,
    MAX_TEMPORARY_DISK_GB,
    OCEAN_DATASETS,
    SITE_OCEAN_ROOT,
    SITE_URL_ENV_VAR,
    TEMPORARY_WORK_ROOT,
    TEMPERATURE_TILE_LEVELS,
)
from data_pipeline.oxygen import bottom_values, compatible_vertical_selection
from data_pipeline.ocean_layers import OCEAN_CONDITION_ORDER, ocean_condition_definitions
from data_pipeline.process_temperature import (
    _build_land_mask,
    _copenhagen_hour,
    _downsample_axis,
    _find_coordinate_name,
    _nice_display_range,
    _render_overlay,
    _surface_stack,
    _tile_bounds,
    _to_celsius,
)

QUERY_INDEX_NAME = "query_index.json"
MANIFEST_NAME = "manifest.json"
FRAME_DATA_DIRECTORY_NAME = "frames"


@dataclass
class FrameBundle:
    key: str
    time_utc: str
    latitudes: np.ndarray
    longitudes: np.ndarray
    values: np.ndarray
    components: dict[str, np.ndarray]
    min_value: float
    max_value: float
    original_units: str
    converted_from_kelvin: bool
    raw_bytes: int
    source: str


@dataclass(frozen=True)
class CopernicusCredentials:
    username: str
    password: str


@dataclass(frozen=True)
class DatasetAccessInfo:
    available_times: pd.DatetimeIndex
    subset_options: dict[str, Any]


def _log(message: str) -> None:
    print(message, flush=True)


def _runtime_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_timestamp(value: Any) -> str:
    return pd.Timestamp(value).tz_convert("UTC").isoformat().replace("+00:00", "Z")


def _time_coord_values(value: Any) -> list[pd.Timestamp]:
    normalized = pd.to_datetime(np.atleast_1d(value), utc=True)
    return [pd.Timestamp(item).tz_convert("UTC") for item in normalized]


def _frame_key(timestamp_iso: str) -> str:
    return (
        timestamp_iso.replace(":", "-")
        .replace("+00:00", "Z")
        .replace(".000000", "")
        .replace(".000", "")
    )


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_frame_json(path: Path) -> dict[str, Any]:
    return _load_json(path)


def _site_json_url(site_url: str, relative_path: str) -> str:
    normalized_site = site_url.rstrip("/")
    normalized_path = relative_path.lstrip("./")
    cache_bust = int(_runtime_now().timestamp())
    return f"{normalized_site}/{normalized_path}?source=updater&t={cache_bust}"


def _fetch_json(url: str, *, label: str, retries: int = 3, timeout_seconds: int = 20) -> dict[str, Any] | None:
    request = urlrequest.Request(
        url,
        headers={
            "User-Agent": "Digital-Baltic-Updater/1.0",
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    for attempt in range(1, retries + 1):
        try:
            with urlrequest.urlopen(request, timeout=timeout_seconds) as response:
                status = getattr(response, "status", 200)
                body = response.read().decode("utf-8")
                if status >= 400:
                    _log(f"{label}: fetch attempt {attempt}/{retries} returned HTTP {status} for {url}")
                else:
                    payload = json.loads(body)
                    summary = sorted(payload.keys())[:8] if isinstance(payload, dict) else []
                    _log(f"{label}: fetch attempt {attempt}/{retries} succeeded from {url} with keys {summary}")
                    return payload
        except json.JSONDecodeError as exc:
            _log(f"{label}: fetch attempt {attempt}/{retries} returned invalid JSON from {url}: {exc}")
        except urlerror.HTTPError as exc:
            _log(f"{label}: fetch attempt {attempt}/{retries} hit HTTP {exc.code} for {url}")
        except urlerror.URLError as exc:
            _log(f"{label}: fetch attempt {attempt}/{retries} hit URL error for {url}: {exc}")

        if attempt < retries:
            sleep_seconds = attempt * 2
            _log(f"{label}: retrying in {sleep_seconds}s")
            time.sleep(sleep_seconds)

    _log(f"{label}: failed after {retries} attempts")
    return None


def _resolve_site_url(value: str | None) -> str | None:
    candidate = value or os.getenv(SITE_URL_ENV_VAR)
    if not candidate:
        return None
    return candidate.rstrip("/")


def _get_copernicus_credentials() -> CopernicusCredentials:
    username = next((os.getenv(name) for name in COPERNICUS_USERNAME_ENV_VARS if os.getenv(name)), None)
    password = next((os.getenv(name) for name in COPERNICUS_PASSWORD_ENV_VARS if os.getenv(name)), None)
    if not username or not password:
        raise RuntimeError(
            "Missing Copernicus credentials. Add COPERNICUS_USERNAME and COPERNICUS_PASSWORD as environment variables."
        )
    return CopernicusCredentials(username=username, password=password)


def _ensure_copernicus_environment(credentials: CopernicusCredentials) -> None:
    os.environ.setdefault("COPERNICUS_USERNAME", credentials.username)
    os.environ.setdefault("COPERNICUS_PASSWORD", credentials.password)
    os.environ.setdefault("COPERNICUSMARINE_SERVICE_USERNAME", credentials.username)
    os.environ.setdefault("COPERNICUSMARINE_SERVICE_PASSWORD", credentials.password)


def _load_remote_frame_payloads(
    site_url: str,
    condition_id: str,
    query_index: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    frame_entries = query_index.get("frames", [])
    payloads: dict[str, dict[str, Any]] = {}
    for frame_entry in frame_entries:
        time_utc = frame_entry.get("time_utc")
        relative_url = str(frame_entry.get("data_url", "")).lstrip("./")
        if not time_utc or not relative_url:
            continue
        frame_url = _site_json_url(site_url, relative_url)
        payload = _fetch_json(frame_url, label=f"{condition_id}: frame {time_utc}")
        if payload:
            payloads[str(time_utc)] = payload
    return payloads


def _previous_condition_state(
    condition_id: str,
    site_url: str | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[str, dict[str, Any]] | None]:
    condition_root = SITE_OCEAN_ROOT / condition_id
    local_manifest = condition_root / MANIFEST_NAME
    local_query_index = condition_root / QUERY_INDEX_NAME
    if local_manifest.exists() and local_query_index.exists():
        _log(f"{condition_id}: using local processed state from {condition_root}")
        query_index = _load_json(local_query_index)
        frame_payloads: dict[str, dict[str, Any]] = {}
        frame_root = condition_root / FRAME_DATA_DIRECTORY_NAME
        if frame_root.exists():
            for frame_file in sorted(frame_root.glob("*.json")):
                payload = _load_frame_json(frame_file)
                time_utc = payload.get("time_utc")
                if time_utc:
                    frame_payloads[str(time_utc)] = payload
        return _load_json(local_manifest), query_index, frame_payloads or None

    if not site_url:
        _log(f"{condition_id}: no site URL configured, so no previous remote state can be checked")
        return None, None, None

    manifest_url = _site_json_url(site_url, "data/ocean/manifest.json")
    _log(f"{condition_id}: probing previously deployed manifest at {manifest_url}")
    ocean_manifest = _fetch_json(manifest_url, label=f"{condition_id}: ocean manifest")
    if not ocean_manifest:
        _log(f"{condition_id}: previously deployed ocean manifest was not available")
        return None, None, None
    condition_entry = next((item for item in ocean_manifest.get("conditions", []) if item.get("id") == condition_id), None)
    metadata = condition_entry.get("metadata") if condition_entry else None
    if not metadata:
        _log(f"{condition_id}: remote manifest does not include metadata for this condition")
        return None, None, None
    query_index_relative_url = str(metadata.get("query_index_url", "")).lstrip("./")
    query_index_url = _site_json_url(site_url, query_index_relative_url)
    _log(f"{condition_id}: probing previously deployed query index at {query_index_url}")
    query_index = _fetch_json(query_index_url, label=f"{condition_id}: query index")
    if not query_index:
        _log(f"{condition_id}: previously deployed query index was not available")
        return None, None, None
    frame_payloads = None
    if "frames" in query_index and "times_utc" in query_index and metadata.get("frames"):
        frame_payloads = _load_remote_frame_payloads(site_url, condition_id, query_index)
    available_times = metadata.get("availableTimes", [])
    _log(
        f"{condition_id}: recovered remote state with {len(available_times)} timestamps"
        + (f" from {available_times[0]} to {available_times[-1]}" if available_times else "")
    )
    return metadata, query_index, frame_payloads


def _find_depth_coordinate_name(dataset: xr.Dataset) -> str | None:
    for name in ("depth", "deptht", "lev", "z"):
        if name in dataset.coords:
            return name
        if name in dataset.variables and getattr(dataset[name], "ndim", 0) == 1:
            return name
    return None


def _dataset_access_info(
    dataset_id: str,
    config: dict[str, Any],
    credentials: CopernicusCredentials,
) -> DatasetAccessInfo:
    remote = copernicusmarine.open_dataset(
        dataset_id=dataset_id,
        username=credentials.username,
        password=credentials.password,
    )
    try:
        if remote is None:
            raise RuntimeError(f"Copernicus returned no dataset for {dataset_id}. Check credentials and dataset access.")
        if "time" not in remote.coords:
            raise RuntimeError(f"Dataset {dataset_id} does not expose a time coordinate.")
        available_times = pd.to_datetime(remote["time"].values, utc=True)
        subset_options: dict[str, Any] = {}
        depth_coordinate_name = _find_depth_coordinate_name(remote)
        if config.get("depth") == "bottom" and (not depth_coordinate_name or remote[depth_coordinate_name].size < 2):
            raise ValueError("Bottom oxygen requires a dataset with the full vertical column.")
        if config.get("depth") == "surface" and depth_coordinate_name:
            depth_values = np.asarray(remote[depth_coordinate_name].values, dtype=np.float64)
            finite_depths = depth_values[np.isfinite(depth_values)]
            if finite_depths.size > 0:
                surface_depth = float(finite_depths.min())
                subset_options.update(
                    {
                        "minimum_depth": surface_depth,
                        "maximum_depth": surface_depth,
                    }
                )
        return DatasetAccessInfo(
            available_times=available_times,
            subset_options=subset_options,
        )
    finally:
        close_method = getattr(remote, "close", None)
        if callable(close_method):
            close_method()


def _desired_times(config: dict[str, Any], available_times: pd.DatetimeIndex) -> list[str]:
    now_utc = _runtime_now()
    start_time = now_utc - timedelta(days=int(config["history_days"]))
    end_time = now_utc + timedelta(days=int(config["forecast_days"]))
    selected = available_times[(available_times >= start_time) & (available_times <= end_time)]
    if len(selected) == 0:
        nearest_index = int((available_times - now_utc).to_series().abs().argmin())
        selected = pd.DatetimeIndex([available_times[nearest_index]])
    selected = _apply_download_interval(config, selected)
    return [_normalize_timestamp(value) for value in selected]


def _apply_download_interval(config: dict[str, Any], selected: pd.DatetimeIndex) -> pd.DatetimeIndex:
    interval_minutes = int(config.get("download_interval_minutes", 60))
    if interval_minutes <= 0 or len(selected) <= 1:
        return selected

    spacing = selected.to_series().diff().dropna()
    if not spacing.empty and spacing.median() >= pd.Timedelta(minutes=interval_minutes):
        return selected

    bucketed: dict[pd.Timestamp, pd.Timestamp] = {}
    for timestamp in selected:
        bucket = timestamp.floor(f"{interval_minutes}min")
        current = bucketed.get(bucket)
        if current is None or abs(timestamp - bucket) < abs(current - bucket):
            bucketed[bucket] = timestamp

    return pd.DatetimeIndex(sorted(bucketed.values()))


def _surface_dataarray(dataset: xr.Dataset, variable_name: str) -> xr.DataArray:
    data = dataset[variable_name]
    for depth_dim in ("depth", "deptht", "lev", "z"):
        if depth_dim in data.dims:
            data = data.isel({depth_dim: 0})
            break
    if "time" not in data.dims:
        data = data.expand_dims(time=[pd.Timestamp(_runtime_now())])
    return data.squeeze(drop=False)


def _extract_values(dataset: xr.Dataset, config: dict[str, Any]) -> tuple[np.ndarray, dict[str, np.ndarray], str, bool, str]:
    processor = config["processor"]

    if processor == "temperature":
        data = _surface_stack(dataset)
        values, original_units, converted_from_kelvin = _to_celsius(data)
        timestamp_iso = _normalize_timestamp(_time_coord_values(data["time"].values)[0])
        return values[0] if values.ndim == 3 else values, {}, original_units, converted_from_kelvin, timestamp_iso

    if processor == "currents":
        u_data = _surface_dataarray(dataset, "uo")
        v_data = _surface_dataarray(dataset, "vo")
        u_values = u_data.values.astype(np.float32)
        v_values = v_data.values.astype(np.float32)
        if u_values.ndim == 3:
            u_values = u_values[0]
        if v_values.ndim == 3:
            v_values = v_values[0]
        values = np.sqrt(np.square(u_values) + np.square(v_values))
        timestamp_iso = _normalize_timestamp(_time_coord_values(u_data["time"].values)[0])
        components = {
            "eastward_mps": u_values,
            "northward_mps": v_values,
        }
        return values, components, str(u_data.attrs.get("units", config["units"])) or config["units"], False, timestamp_iso

    if processor == "waves":
        height_data = _surface_dataarray(dataset, "VHM0")
        direction_data = _surface_dataarray(dataset, "VMDR")
        period_data = _surface_dataarray(dataset, "VTM10")
        height_values = height_data.values.astype(np.float32)
        direction_from = direction_data.values.astype(np.float32)
        period_values = period_data.values.astype(np.float32)
        if height_values.ndim == 3:
            height_values = height_values[0]
        if direction_from.ndim == 3:
            direction_from = direction_from[0]
        if period_values.ndim == 3:
            period_values = period_values[0]
        direction_to = np.mod(direction_from + 180.0, 360.0).astype(np.float32)
        direction_radians = np.deg2rad(direction_to.astype(np.float64))
        eastward_unit = np.sin(direction_radians).astype(np.float32)
        northward_unit = np.cos(direction_radians).astype(np.float32)
        timestamp_iso = _normalize_timestamp(_time_coord_values(height_data["time"].values)[0])
        components = {
            "direction_from_degrees": direction_from,
            "direction_to_degrees": direction_to,
            "eastward_unit": eastward_unit,
            "northward_unit": northward_unit,
            "mean_period_seconds": period_values,
        }
        return height_values, components, str(height_data.attrs.get("units", config["units"])) or config["units"], False, timestamp_iso

    if config.get("depth") == "bottom":
        data = dataset[str(config["primary_variable"])]
        depth_name = _find_depth_coordinate_name(dataset)
        if not depth_name or depth_name not in data.dims:
            raise ValueError("Bottom oxygen requires an explicit vertical dimension.")
        coordinate = dataset[depth_name]
        if str(coordinate.attrs.get("units", "")).lower() not in {"m", "metre", "meter", "metres", "meters"} or coordinate.attrs.get("positive", "down") != "down":
            raise ValueError("Bottom oxygen requires depth in metres, positive down.")
        lat_name = _find_coordinate_name(dataset, ["latitude", "lat"])
        lon_name = _find_coordinate_name(dataset, ["longitude", "lon"])
        data = data.transpose("time", depth_name, lat_name, lon_name)
        if data.sizes["time"] != 1:
            raise ValueError("Process one oxygen timestamp at a time.")
        values, depths = bottom_values(data.values[0], coordinate.values, depth_axis=0)
        timestamp_iso = _normalize_timestamp(_time_coord_values(data["time"].values)[0])
        return values, {"bottom_depth_m": depths}, str(data.attrs.get("units", config["units"])), False, timestamp_iso

    data = _surface_dataarray(dataset, str(config["primary_variable"]))
    values = data.values.astype(np.float32)
    if values.ndim == 3:
        values = values[0]
    timestamp_iso = _normalize_timestamp(_time_coord_values(data["time"].values)[0])
    return values, {}, str(data.attrs.get("units", config["units"])) or config["units"], False, timestamp_iso


def _validate_frame(
    config: dict[str, Any],
    requested_time: str,
    detected_time: str,
    latitudes: np.ndarray,
    longitudes: np.ndarray,
    values: np.ndarray,
) -> None:
    if latitudes.size == 0 or longitudes.size == 0:
        raise ValueError(f"{config['label']} dataset is missing latitude or longitude coordinates.")

    if latitudes.min() < BBOX["minimum_latitude"] - 0.5 or latitudes.max() > BBOX["maximum_latitude"] + 0.5:
        raise ValueError(f"{config['label']} latitude coverage is outside the Baltic processing bounds.")
    if longitudes.min() < BBOX["minimum_longitude"] - 0.5 or longitudes.max() > BBOX["maximum_longitude"] + 0.5:
        raise ValueError(f"{config['label']} longitude coverage is outside the Baltic processing bounds.")

    valid_values = values[np.isfinite(values)]
    if valid_values.size == 0:
        raise ValueError(f"{config['label']} contains no valid ocean values.")

    plausible_min, plausible_max = config["plausible_range"]
    if float(valid_values.min()) < plausible_min or float(valid_values.max()) > plausible_max:
        raise ValueError(f"{config['label']} values are outside the plausible range {config['plausible_range']}.")

    requested = pd.Timestamp(requested_time).tz_convert("UTC")
    detected = pd.Timestamp(detected_time).tz_convert("UTC")
    if abs((requested - detected).total_seconds()) > 3600:
        raise ValueError(f"Downloaded timestamp {detected_time} does not match requested time {requested_time}.")


def _subset_options(config: dict[str, Any], access_info: DatasetAccessInfo | None = None) -> dict[str, Any]:
    options: dict[str, Any] = {}
    if access_info:
        options.update(access_info.subset_options)
    vertical_subset = config.get("vertical_subset")
    if isinstance(vertical_subset, dict):
        options.update({key: value for key, value in vertical_subset.items() if key not in options})
    return options


def _download_timestamp(
    config: dict[str, Any],
    timestamp_iso: str,
    download_root: Path,
    credentials: CopernicusCredentials,
    access_info: DatasetAccessInfo,
) -> FrameBundle:
    frame_key = _frame_key(timestamp_iso)
    condition_root = download_root / config["id"]
    condition_root.mkdir(parents=True, exist_ok=True)
    raw_path = condition_root / f"{frame_key}.nc"

    copernicusmarine.subset(
        dataset_id=config["dataset_id"],
        username=credentials.username,
        password=credentials.password,
        variables=list(config["variables"]),
        start_datetime=timestamp_iso,
        end_datetime=timestamp_iso,
        minimum_longitude=BBOX["minimum_longitude"],
        maximum_longitude=BBOX["maximum_longitude"],
        minimum_latitude=BBOX["minimum_latitude"],
        maximum_latitude=BBOX["maximum_latitude"],
        output_directory=condition_root,
        output_filename=raw_path.name,
        overwrite=True,
        disable_progress_bar=True,
        **_subset_options(config, access_info),
    )

    if not raw_path.exists():
        raise FileNotFoundError(f"Copernicus download did not create {raw_path.name}.")

    try:
        with xr.open_dataset(raw_path) as dataset:
            lat_name = _find_coordinate_name(dataset, ["latitude", "lat"])
            lon_name = _find_coordinate_name(dataset, ["longitude", "lon"])
            latitudes = dataset[lat_name].values.astype(np.float64)
            longitudes = dataset[lon_name].values.astype(np.float64)
            values, components, original_units, converted_from_kelvin, detected_time = _extract_values(dataset, config)

        if latitudes[0] > latitudes[-1]:
            latitudes = latitudes[::-1]
            values = values[::-1, :]
            components = {name: component[::-1, :] for name, component in components.items()}
        if longitudes[0] > longitudes[-1]:
            longitudes = longitudes[::-1]
            values = values[:, ::-1]
            components = {name: component[:, ::-1] for name, component in components.items()}

        _validate_frame(config, timestamp_iso, detected_time, latitudes, longitudes, values)
        valid_values = values[np.isfinite(values)]
        return FrameBundle(
            key=frame_key,
            time_utc=detected_time,
            latitudes=latitudes,
            longitudes=longitudes,
            values=values,
            components=components,
            min_value=round(float(valid_values.min()), 3),
            max_value=round(float(valid_values.max()), 3),
            original_units=original_units,
            converted_from_kelvin=converted_from_kelvin,
            raw_bytes=raw_path.stat().st_size,
            source="downloaded",
        )
    finally:
        if raw_path.exists():
            raw_path.unlink()


def _restore_frames(
    config: dict[str, Any],
    desired_times: list[str],
    refresh_times: set[str],
    previous_metadata: dict[str, Any] | None,
    previous_query_index: dict[str, Any] | None,
    previous_frame_payloads: dict[str, dict[str, Any]] | None,
) -> list[FrameBundle]:
    if not previous_metadata or not previous_query_index or not compatible_vertical_selection(config, previous_metadata):
        return []

    latitudes = np.array(previous_query_index["latitudes"], dtype=np.float64)
    longitudes = np.array(previous_query_index["longitudes"], dtype=np.float64)
    values_key = previous_metadata.get("query_value_key", config["query_value_key"])
    if values_key in previous_query_index:
        values_by_time = {
            timestamp_iso: previous_query_index[values_key][index]
            for index, timestamp_iso in enumerate(previous_query_index.get("times_utc", []))
        }
        component_payload = previous_query_index.get("components", {})
        components_by_time = {
            timestamp_iso: {
                name: np.array(series[index], dtype=np.float32)
                for name, series in component_payload.items()
                if index < len(series)
            }
            for index, timestamp_iso in enumerate(previous_query_index.get("times_utc", []))
        }
    else:
        frame_payloads = previous_frame_payloads or {}
        values_by_time = {
            timestamp_iso: frame_payloads[timestamp_iso].get(values_key)
            for timestamp_iso in previous_query_index.get("times_utc", [])
            if timestamp_iso in frame_payloads
        }
        components_by_time = {
            timestamp_iso: {
                name: np.array(values, dtype=np.float32)
                for name, values in frame_payloads[timestamp_iso].get("components", {}).items()
            }
            for timestamp_iso in previous_query_index.get("times_utc", [])
            if timestamp_iso in frame_payloads
        }
    frames_by_time = {frame["time_utc"]: frame for frame in previous_metadata.get("frames", [])}

    restored: list[FrameBundle] = []
    for timestamp_iso in desired_times:
        if timestamp_iso in refresh_times or timestamp_iso not in values_by_time or timestamp_iso not in frames_by_time:
            continue
        grid = np.array(values_by_time[timestamp_iso], dtype=np.float32)
        valid_values = grid[np.isfinite(grid)]
        components = components_by_time.get(timestamp_iso, {})
        restored.append(
            FrameBundle(
                key=frames_by_time[timestamp_iso]["key"],
                time_utc=timestamp_iso,
                latitudes=latitudes,
                longitudes=longitudes,
                values=grid,
                components=components,
                min_value=round(float(valid_values.min()), 3),
                max_value=round(float(valid_values.max()), 3),
                original_units=previous_metadata.get("provenance", {}).get("original_units", config["units"]),
                converted_from_kelvin=bool(previous_metadata.get("provenance", {}).get("converted_from_kelvin", False)),
                raw_bytes=0,
                source="carried",
            )
        )
    return restored


def _resample_frame(
    frame_values: np.ndarray,
    latitudes: np.ndarray,
    longitudes: np.ndarray,
    level: dict[str, Any],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    values = frame_values
    lats = latitudes
    lons = longitudes
    values, lats = _downsample_axis(values, lats, level["target_rows"], axis=0)
    values, lons = _downsample_axis(values, lons, level["target_cols"], axis=1)
    return values, lats, lons


def _nearest_frame_index(time_values: list[str]) -> int:
    current_utc = pd.Timestamp(_runtime_now())
    return min(range(len(time_values)), key=lambda index: abs(pd.Timestamp(time_values[index]) - current_utc))


def _write_tiles_for_frame(
    condition_root: Path,
    frame_key: str,
    level_id: str,
    tile_x: int,
    tile_y: int,
    tile_values: np.ndarray,
    display_min: float,
    display_max: float,
    palette_names: list[str],
    default_palette: str,
) -> dict[str, int]:
    level_root = condition_root / "tiles" / frame_key / level_id
    sizes: dict[str, int] = {}
    for palette_name in palette_names:
        render_palette = palette_name if palette_name != "default" else default_palette
        palette_root = level_root / palette_name
        palette_root.mkdir(parents=True, exist_ok=True)
        tile_path = palette_root / f"{tile_x}_{tile_y}.png"
        _render_overlay(tile_values, display_min, display_max, render_palette).save(tile_path)
        sizes[palette_name] = tile_path.stat().st_size
    return sizes


def _build_condition_outputs(
    config: dict[str, Any],
    frames: list[FrameBundle],
    carried_forward_count: int,
    downloaded_count: int,
    preserved_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    frames = sorted(frames, key=lambda frame: pd.Timestamp(frame.time_utc))
    condition_root = SITE_OCEAN_ROOT / config["id"]
    first_frame = frames[0]
    latitudes = first_frame.latitudes
    longitudes = first_frame.longitudes
    values_stack = np.stack([frame.values for frame in frames], axis=0)

    if condition_root.exists():
        shutil.rmtree(condition_root)
    condition_root.mkdir(parents=True, exist_ok=True)
    (condition_root / "tiles").mkdir(parents=True, exist_ok=True)
    frame_root = condition_root / FRAME_DATA_DIRECTORY_NAME
    frame_root.mkdir(parents=True, exist_ok=True)

    display_min, display_max = _nice_display_range(values_stack, nonnegative=config["id"] in {"currents", "salinity", "oxygen", "waves"})
    valid_mask = np.any(np.isfinite(values_stack), axis=0)
    _build_land_mask(valid_mask).save(condition_root / LAND_MASK_FILENAME)

    performance_levels: dict[str, dict[str, Any]] = {}
    tile_size_accumulator = {
        level["id"]: {palette_name: [] for palette_name in config["palettes"]}
        for level in TEMPERATURE_TILE_LEVELS
    }

    for level in TEMPERATURE_TILE_LEVELS:
        preview_values, preview_lats, preview_lons = _resample_frame(values_stack[0], latitudes, longitudes, level)
        rows, cols = preview_values.shape
        lat_step = float(np.median(np.diff(preview_lats))) if preview_lats.size > 1 else 0.05
        lon_step = float(np.median(np.diff(preview_lons))) if preview_lons.size > 1 else 0.05
        tiles_for_level: list[dict[str, Any]] = []
        tile_y = 0
        for row_start in range(0, rows, level["tile_rows"]):
            row_end = min(row_start + level["tile_rows"], rows)
            tile_x = 0
            for col_start in range(0, cols, level["tile_cols"]):
                col_end = min(col_start + level["tile_cols"], cols)
                tiles_for_level.append(
                    {
                        "x": tile_x,
                        "y": tile_y,
                        "bbox": _tile_bounds(
                            preview_lats[row_start:row_end],
                            preview_lons[col_start:col_end],
                            lat_step,
                            lon_step,
                        ),
                        "row_start": row_start,
                        "row_end": row_end,
                        "column_start": col_start,
                        "column_end": col_end,
                        "rows": row_end - row_start,
                        "columns": col_end - col_start,
                    }
                )
                tile_x += 1
            tile_y += 1

        performance_levels[level["id"]] = {
            "id": level["id"],
            "zoom_min": level["zoom_min"],
            "zoom_max": level["zoom_max"],
            "rows": rows,
            "columns": cols,
            "tile_rows": level["tile_rows"],
            "tile_cols": level["tile_cols"],
            "preload_ring": level["preload_ring"],
            "tile_count": len(tiles_for_level),
            "tiles": tiles_for_level,
            "average_tile_bytes": {},
        }

    values_key = str(config["query_value_key"])
    frame_payloads: list[dict[str, Any]] = []
    query_index_frames: list[dict[str, Any]] = []
    for frame_index, frame in enumerate(frames):
        payload = {
            "index": frame_index,
            "key": frame.key,
            "time_utc": frame.time_utc,
            "tile_path": f"./data/ocean/{config['id']}/tiles/{frame.key}",
            "display_label_local": pd.Timestamp(frame.time_utc)
            .tz_convert(BALTIC_REGION["time_zone"])
            .strftime("%a %d %b, %H:%M"),
            "local_hour": _copenhagen_hour(frame.time_utc),
            "is_night": _copenhagen_hour(frame.time_utc) >= 21 or _copenhagen_hour(frame.time_utc) < 5,
        }
        if config["id"] == "temperature":
            payload["min_celsius"] = frame.min_value
            payload["max_celsius"] = frame.max_value
        else:
            payload["min_value"] = frame.min_value
            payload["max_value"] = frame.max_value
        if "bottom_depth_m" in frame.components:
            depth_values = frame.components["bottom_depth_m"]
            payload["bottom_depth_range_m"] = {"min": float(np.nanmin(depth_values)), "max": float(np.nanmax(depth_values))}
        frame_payloads.append(payload)
        query_index_frames.append(
            {
                "index": frame_index,
                "key": frame.key,
                "time_utc": frame.time_utc,
                "data_url": f"./data/ocean/{config['id']}/{FRAME_DATA_DIRECTORY_NAME}/{frame.key}.json",
            }
        )

        frame_data_payload = {
            "key": frame.key,
            "time_utc": frame.time_utc,
            values_key: [
                [None if not np.isfinite(value) else round(float(value), 4) for value in row]
                for row in frame.values.tolist()
            ],
            "components": {
                component_name: [
                    [None if not np.isfinite(value) else round(float(value), 4) for value in row]
                    for row in component_values.tolist()
                ]
                for component_name, component_values in frame.components.items()
            },
        }
        (frame_root / f"{frame.key}.json").write_text(json.dumps(frame_data_payload), encoding="utf-8")

        for level in TEMPERATURE_TILE_LEVELS:
            resampled_values, _level_lats, _level_lons = _resample_frame(frame.values, latitudes, longitudes, level)
            for tile in performance_levels[level["id"]]["tiles"]:
                tile_values = resampled_values[tile["row_start"] : tile["row_end"], tile["column_start"] : tile["column_end"]]
                sizes = _write_tiles_for_frame(
                    condition_root=condition_root,
                    frame_key=frame.key,
                    level_id=level["id"],
                    tile_x=tile["x"],
                    tile_y=tile["y"],
                    tile_values=tile_values,
                    display_min=display_min,
                    display_max=display_max,
                    palette_names=list(config["palettes"]),
                    default_palette=str(config["default_palette"]),
                )
                if frame_index == 0:
                    for palette_name, size_bytes in sizes.items():
                        tile_size_accumulator[level["id"]][palette_name].append(size_bytes)

    for level_id, palette_sizes in tile_size_accumulator.items():
        performance_levels[level_id]["average_tile_bytes"] = {
            palette_name: round(float(np.mean(values)), 1) if values else 0.0
            for palette_name, values in palette_sizes.items()
        }

    component_names = sorted({name for frame in frames for name in frame.components.keys()})
    query_index_payload = {
        "latitudes": [round(float(value), 6) for value in latitudes.tolist()],
        "longitudes": [round(float(value), 6) for value in longitudes.tolist()],
        "times_utc": [frame.time_utc for frame in frames],
        "frame_keys": [frame.key for frame in frames],
        "frames": query_index_frames,
        "component_names": component_names,
    }
    (condition_root / QUERY_INDEX_NAME).write_text(json.dumps(query_index_payload), encoding="utf-8")

    initial_frame_index = _nearest_frame_index([frame.time_utc for frame in frames])
    level_byte_totals = {
        level_id: sum(
            (
                condition_root / "tiles" / frame_payloads[initial_frame_index]["key"] / level_id / list(config["palettes"])[0] / f"{tile['x']}_{tile['y']}.png"
            ).stat().st_size
            for tile in level_payload["tiles"]
        )
        for level_id, level_payload in performance_levels.items()
    }

    metadata_payload: dict[str, Any] = {
        "condition": ocean_condition_definitions()[config["id"]],
        "available": True,
        "query_value_key": config["query_value_key"],
        "query_index_url": f"./data/ocean/{config['id']}/{QUERY_INDEX_NAME}",
        "layer": {
            "id": config["id"],
            "label": config["label"],
            "variable": config["variable"],
        },
        "provenance": {
            "source": "Copernicus Marine",
            "product_id": config["product_id"],
            "dataset_id": config["dataset_id"],
            "type": config["dataset_type"],
            "retrieved_at_utc": _runtime_now().isoformat(),
            "requested_start_utc": frames[0].time_utc,
            "requested_end_utc": frames[-1].time_utc,
            "original_units": frames[0].original_units,
            "display_units": config["units"],
            "converted_from_kelvin": frames[0].converted_from_kelvin,
        },
        "region": {
            "name": BALTIC_REGION["name"],
            "bbox": BBOX,
            "initial_view": INITIAL_VIEW,
            "max_bounds": BALTIC_REGION["max_bounds"],
            "time_zone": BALTIC_REGION["time_zone"],
        },
        "fallback": {
            "land_mask_url": f"./data/ocean/{config['id']}/land_mask.png",
            "land_opacity": 0.96,
            "background_color": "#07111d",
            "land_mask_coordinates": [
                [BBOX["minimum_longitude"], BBOX["maximum_latitude"]],
                [BBOX["maximum_longitude"], BBOX["maximum_latitude"]],
                [BBOX["maximum_longitude"], BBOX["minimum_latitude"]],
                [BBOX["minimum_longitude"], BBOX["minimum_latitude"]],
            ],
        },
        "tiling": {
            "palettes": list(config["palettes"]),
            "tile_root_url": f"./data/ocean/{config['id']}/tiles",
            "levels": list(performance_levels.values()),
        },
        "frames": frame_payloads,
        "initial_frame_index": initial_frame_index,
        "availableTimes": [frame.time_utc for frame in frames],
        "files": {
            "metadata_url": f"./data/ocean/{config['id']}/manifest.json",
            "land_mask_filename": LAND_MASK_FILENAME,
            "query_index_filename": QUERY_INDEX_NAME,
        },
        "performance": {
            "raw_source_bytes_refreshed": sum(frame.raw_bytes for frame in frames if frame.source == "downloaded"),
            "processed_level_bytes": level_byte_totals,
            "average_tile_bytes": {
                level_id: performance_levels[level_id]["average_tile_bytes"].get(list(config["palettes"])[0], 0.0)
                for level_id in performance_levels
            },
            "initial_overview_request_count": performance_levels["overview"]["tile_count"],
            "estimated_browser_memory_mb": round(
                (performance_levels["overview"]["rows"] * performance_levels["overview"]["columns"] * 4) / 1_000_000,
                2,
            ),
            "carried_forward_timestamps": carried_forward_count,
            "downloaded_timestamps": downloaded_count,
            "runner_limits": {
                "temporary_disk_gb": MAX_TEMPORARY_DISK_GB,
                "ram_gb": MAX_RUNNER_RAM_GB,
            },
        },
    }
    if config["id"] == "temperature":
        metadata_payload["value_range_celsius"] = {
            "min": round(float(np.nanmin(values_stack)), 3),
            "max": round(float(np.nanmax(values_stack)), 3),
            "display_min": display_min,
            "display_max": display_max,
        }
    else:
        metadata_payload["value_range"] = {
            "min": round(float(np.nanmin(values_stack)), 3),
            "max": round(float(np.nanmax(values_stack)), 3),
            "display_min": display_min,
            "display_max": display_max,
        }
    if config.get("depth_label"):
        metadata_payload["depth_label"] = config["depth_label"]
    if preserved_metadata:
        # Repackaging old files is not a successful download. Retain their original meaning and update time.
        metadata_payload["condition"] = preserved_metadata["condition"]
        metadata_payload["provenance"] = preserved_metadata["provenance"]
        metadata_payload["layer"] = preserved_metadata.get("layer", metadata_payload["layer"])
        metadata_payload.pop("depth_label", None)
        if "depth_label" in preserved_metadata:
            metadata_payload["depth_label"] = preserved_metadata["depth_label"]
    (condition_root / MANIFEST_NAME).write_text(json.dumps(metadata_payload, indent=2), encoding="utf-8")
    return metadata_payload


def _write_root_manifest(available_metadata: dict[str, dict[str, Any]]) -> None:
    definitions = ocean_condition_definitions()
    conditions: list[dict[str, Any]] = []
    for condition_id in OCEAN_CONDITION_ORDER:
        definition = definitions[condition_id]
        metadata = available_metadata.get(condition_id)
        if metadata:
            definition = metadata.get("condition", definition)
            conditions.append(
                {
                    "id": definition["id"],
                    "label": definition["label"],
                    "available": True,
                    "condition": definition,
                    "metadata": metadata,
                }
            )
        else:
            conditions.append(
                {
                    "id": definition["id"],
                    "label": definition["label"],
                    "available": False,
                    "condition": definition,
                }
            )

    default_condition = next((condition_id for condition_id in OCEAN_CONDITION_ORDER if condition_id in available_metadata), "temperature")
    region = available_metadata.get(default_condition, {}).get(
        "region",
        {
            "name": BALTIC_REGION["name"],
            "bbox": BALTIC_REGION["bbox"],
            "initial_view": INITIAL_VIEW,
            "max_bounds": BALTIC_REGION["max_bounds"],
            "time_zone": BALTIC_REGION["time_zone"],
        },
    )
    SITE_OCEAN_ROOT.mkdir(parents=True, exist_ok=True)
    (SITE_OCEAN_ROOT / MANIFEST_NAME).write_text(
        json.dumps(
            {
                "region": region,
                "default_condition_id": default_condition,
                "conditions": conditions,
                "generated_at_utc": _runtime_now().isoformat(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def _update_condition(
    config: dict[str, Any],
    site_url: str | None,
    force_full_refresh: bool,
    credentials: CopernicusCredentials,
) -> dict[str, Any] | None:
    previous_metadata, previous_query_index, previous_frame_payloads = _previous_condition_state(config["id"], site_url)
    access_info = _dataset_access_info(str(config["dataset_id"]), config, credentials)
    desired_times = _desired_times(config, access_info.available_times)
    existing_times = set(previous_metadata.get("availableTimes", [])) if previous_metadata and compatible_vertical_selection(config, previous_metadata) else set()
    _log(
        f"{config['label']}: desired window has {len(desired_times)} timestamps"
        + (f" from {desired_times[0]} to {desired_times[-1]}" if desired_times else "")
    )
    _log(f"{config['label']}: found {len(existing_times)} previously published timestamps")

    refresh_cutoff = _runtime_now() - timedelta(hours=int(config["refresh_hours"]))
    refresh_times = {
        timestamp_iso
        for timestamp_iso in desired_times
        if force_full_refresh
        or timestamp_iso not in existing_times
        or pd.Timestamp(timestamp_iso).tz_convert("UTC").to_pydatetime() >= refresh_cutoff
    }
    timestamps_to_remove = existing_times.difference(desired_times)
    _log(
        f"{config['label']}: refresh cutoff is {refresh_cutoff.isoformat().replace('+00:00', 'Z')}; "
        f"carrying {len(set(desired_times).difference(refresh_times).intersection(existing_times))}, "
        f"refreshing {len(refresh_times)}, removing {len(timestamps_to_remove)}"
    )

    if not refresh_times and not timestamps_to_remove and existing_times == set(desired_times):
        _log(f"{config['label']}: No new Copernicus data.")
        return previous_metadata

    restored_frames = _restore_frames(
        config=config,
        desired_times=desired_times,
        refresh_times=refresh_times,
        previous_metadata=previous_metadata,
        previous_query_index=previous_query_index,
        previous_frame_payloads=previous_frame_payloads,
    )

    downloaded_frames: list[FrameBundle] = []
    download_root = TEMPORARY_WORK_ROOT / "downloads"
    for timestamp_iso in desired_times:
        if timestamp_iso not in refresh_times:
            continue
        frame = _download_timestamp(config, timestamp_iso, download_root, credentials, access_info)
        downloaded_frames.append(frame)
        _log(f"{config['label']}: processed {frame.time_utc}")

    frames = restored_frames + downloaded_frames
    if not frames:
        return previous_metadata

    metadata = _build_condition_outputs(
        config=config,
        frames=frames,
        carried_forward_count=len(restored_frames),
        downloaded_count=len(downloaded_frames),
    )

    _log(f"{config['label']}: carried {len(restored_frames)}, downloaded {len(downloaded_frames)}")
    return metadata


def update_all_conditions(site_url: str | None, force_full_refresh: bool = False) -> None:
    load_dotenv()
    credentials = _get_copernicus_credentials()
    _ensure_copernicus_environment(credentials)
    if TEMPORARY_WORK_ROOT.exists():
        shutil.rmtree(TEMPORARY_WORK_ROOT)
    TEMPORARY_WORK_ROOT.mkdir(parents=True, exist_ok=True)

    available_metadata: dict[str, dict[str, Any]] = {}
    for condition_id in OCEAN_CONDITION_ORDER:
        config = OCEAN_DATASETS.get(condition_id)
        if not config:
            continue
        try:
            metadata = _update_condition(config, site_url, force_full_refresh, credentials)
            if metadata:
                available_metadata[condition_id] = metadata
        except Exception as exc:
            _log(f"{config['label']}: update failed, keeping previous valid data if available. Reason: {exc}")
            previous_metadata, previous_query_index, previous_frame_payloads = _previous_condition_state(condition_id, site_url)
            if previous_metadata and previous_query_index:
                preserved_config = dict(config)
                if not compatible_vertical_selection(config, previous_metadata):
                    preserved_config["depth"] = "surface"
                preserved_frames = _restore_frames(
                    config=preserved_config,
                    desired_times=list(previous_metadata.get("availableTimes", [])),
                    refresh_times=set(),
                    previous_metadata=previous_metadata,
                    previous_query_index=previous_query_index,
                    previous_frame_payloads=previous_frame_payloads,
                )
                if preserved_frames:
                    available_metadata[condition_id] = _build_condition_outputs(
                        config=preserved_config,
                        frames=preserved_frames,
                        carried_forward_count=len(preserved_frames),
                        downloaded_count=0,
                        preserved_metadata=previous_metadata,
                    )

    _write_root_manifest(available_metadata)
    if TEMPORARY_WORK_ROOT.exists():
        shutil.rmtree(TEMPORARY_WORK_ROOT)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update all Digital Baltic Sea Copernicus ocean-condition assets in small condition/timestep batches."
    )
    parser.add_argument(
        "--site-url",
        default=None,
        help="Current deployed site URL, used to inspect already-published data before downloading only new timestamps.",
    )
    parser.add_argument(
        "--force-full-refresh",
        action="store_true",
        help="Re-download every timestamp in the configured operational window for every condition.",
    )
    args = parser.parse_args()

    update_all_conditions(
        site_url=_resolve_site_url(args.site_url),
        force_full_refresh=args.force_full_refresh,
    )


if __name__ == "__main__":
    main()
