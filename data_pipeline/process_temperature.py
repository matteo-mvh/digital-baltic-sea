from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr
from dotenv import load_dotenv
from PIL import Image

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from data_pipeline.config import (
    BALTIC_REGION,
    BBOX,
    DATASET_ID,
    DATASET_TYPE,
    INITIAL_VIEW,
    LAND_MASK_FILENAME,
    LAYER_LABEL,
    METADATA_FILENAME,
    PALETTE_COLOR_STOPS,
    PRODUCT_ID,
    QUERY_INDEX_FILENAME,
    TEMPERATURE_TILE_LEVELS,
    TEMPERATURE_TILE_PALETTES,
    TEMPERATURE_VARIABLE,
    WEB_LAND_MASK_URL,
    WEB_METADATA_URL,
    WEB_TILE_ROOT,
    ensure_directories,
    land_mask_output_path,
    metadata_output_path,
    query_index_output_path,
    raw_dataset_path,
    raw_download_metadata_path,
    temperature_tile_root,
)


def _find_coordinate_name(dataset: xr.Dataset, candidates: list[str]) -> str:
    for name in candidates:
        if name in dataset.coords:
            return name
        if name in dataset.variables and dataset[name].ndim == 1:
            return name
    raise KeyError(f"None of the coordinate candidates were present: {candidates}")


def _surface_stack(dataset: xr.Dataset) -> xr.DataArray:
    if TEMPERATURE_VARIABLE not in dataset.data_vars:
        available = ", ".join(dataset.data_vars.keys())
        raise KeyError(f"Expected variable '{TEMPERATURE_VARIABLE}' not found. Available variables: {available}")

    data = dataset[TEMPERATURE_VARIABLE]
    for depth_dim in ("depth", "deptht", "lev", "z"):
        if depth_dim in data.dims:
            data = data.isel({depth_dim: 0})
            break

    if "time" not in data.dims:
        data = data.expand_dims(time=[pd.Timestamp(datetime.now(timezone.utc))])

    return data.squeeze(drop=False)


def _time_coord_values(value: Any) -> list[pd.Timestamp]:
    normalized = pd.to_datetime(np.atleast_1d(value), utc=True)
    return [pd.Timestamp(item).tz_convert("UTC") for item in normalized]


def _time_values_from_surface(surface: xr.DataArray) -> list[str]:
    if "time" in surface.coords:
        return [value.isoformat() for value in _time_coord_values(surface["time"].values)]
    return [datetime.now(timezone.utc).isoformat()]


def _to_celsius(data: xr.DataArray) -> tuple[np.ndarray, str, bool]:
    raw = data.values.astype(np.float32)
    units = str(data.attrs.get("units", "")).strip()
    lowered = units.lower()
    if lowered in {"k", "kelvin"} or "kelvin" in lowered:
        return raw - 273.15, units, True
    return raw, units or "unknown", False


def _nice_display_range(values: np.ndarray, nonnegative: bool = False) -> tuple[float, float]:
    valid = values[np.isfinite(values)]
    if valid.size == 0:
        raise ValueError("No valid ocean temperature values found in the processed Baltic subset.")

    raw_min = float(valid.min())
    raw_max = float(valid.max())
    if nonnegative and raw_min < 0:
        raise ValueError("Negative source values are invalid for this magnitude or concentration.")
    step = 10 ** math.floor(math.log10(max(raw_max - raw_min, abs(raw_max) * 0.01, 0.01))) / 5
    minimum = math.floor(raw_min / step) * step
    maximum = math.ceil(raw_max / step) * step
    if minimum == maximum:
        maximum += step
    return minimum, maximum


def _palette_table(palette_name: str) -> np.ndarray:
    return np.array([[stop, *rgb] for stop, rgb in PALETTE_COLOR_STOPS[palette_name]], dtype=np.float32)


def _interpolate_palette(normalized: np.ndarray, palette_name: str) -> np.ndarray:
    stop_table = _palette_table(palette_name)
    output = np.zeros(normalized.shape + (3,), dtype=np.float32)

    for idx in range(len(stop_table) - 1):
        start_stop, sr, sg, sb = stop_table[idx]
        end_stop, er, eg, eb = stop_table[idx + 1]
        mask = (normalized >= start_stop) & (normalized <= end_stop)
        if not np.any(mask):
            continue
        ratio = (normalized[mask] - start_stop) / max(end_stop - start_stop, 1e-6)
        start_color = np.array([sr, sg, sb], dtype=np.float32)
        end_color = np.array([er, eg, eb], dtype=np.float32)
        output[mask] = start_color + (end_color - start_color) * ratio[:, None]

    output[normalized <= stop_table[0][0]] = stop_table[0][1:]
    output[normalized >= stop_table[-1][0]] = stop_table[-1][1:]
    return output.astype(np.uint8)


def _shrink_water_mask(valid_mask: np.ndarray, buffer_cells: int = 2) -> np.ndarray:
    if buffer_cells <= 0:
        return valid_mask

    shrunken = valid_mask.copy()
    for _ in range(buffer_cells):
        padded = np.pad(shrunken, 1, mode="constant", constant_values=False)
        north = padded[:-2, 1:-1]
        south = padded[2:, 1:-1]
        west = padded[1:-1, :-2]
        east = padded[1:-1, 2:]
        northwest = padded[:-2, :-2]
        northeast = padded[:-2, 2:]
        southwest = padded[2:, :-2]
        southeast = padded[2:, 2:]
        fully_surrounded = north & south & west & east & northwest & northeast & southwest & southeast
        shrunken &= fully_surrounded
    return shrunken


def _render_overlay(values_celsius: np.ndarray, display_min: float, display_max: float, palette_name: str) -> Image.Image:
    normalized = (values_celsius - display_min) / (display_max - display_min)
    normalized = np.clip(normalized, 0.0, 1.0)
    rgb = _interpolate_palette(normalized, palette_name)
    valid_mask = np.isfinite(values_celsius)
    coastline_safe_water = _shrink_water_mask(valid_mask, buffer_cells=2)
    alpha = np.where(coastline_safe_water, 184, 0).astype(np.uint8)
    rgb[~np.isfinite(values_celsius)] = 0
    rgba = np.dstack((rgb, alpha))
    rgba = np.flipud(rgba)
    return Image.fromarray(rgba, mode="RGBA")


def _build_land_mask(valid_mask: np.ndarray) -> Image.Image:
    land = ~valid_mask
    height, width = land.shape

    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[land] = np.array([84, 92, 78, 255], dtype=np.uint8)

    coastline = np.zeros_like(land, dtype=bool)
    for row in range(height):
        for col in range(width):
            if not land[row, col]:
                continue
            row_start = max(0, row - 1)
            row_end = min(height, row + 2)
            col_start = max(0, col - 1)
            col_end = min(width, col + 2)
            if np.any(valid_mask[row_start:row_end, col_start:col_end]):
                coastline[row, col] = True

    rgba[coastline] = np.array([227, 221, 199, 255], dtype=np.uint8)
    rgba = np.flipud(rgba)
    return Image.fromarray(rgba, mode="RGBA").resize((width * 2, height * 2), Image.Resampling.NEAREST)


def _load_download_sidecar() -> dict[str, Any]:
    path = raw_download_metadata_path()
    if not path.exists():
        return {
            "product_id": PRODUCT_ID,
            "dataset_id": DATASET_ID,
            "dataset_type": DATASET_TYPE,
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        }
    return json.loads(path.read_text(encoding="utf-8"))


def _downsample_axis(values: np.ndarray, source_axis: np.ndarray, target_size: int | None, axis: int) -> tuple[np.ndarray, np.ndarray]:
    if target_size is None or target_size >= values.shape[axis]:
        return values, source_axis

    edges = np.linspace(0, source_axis.size, target_size + 1, dtype=int)
    reduced_slices: list[np.ndarray] = []
    reduced_axis: list[float] = []
    for start, end in zip(edges[:-1], edges[1:]):
        if end <= start:
            end = min(start + 1, source_axis.size)
        reduced_axis.append(float(np.mean(source_axis[start:end])))
        subset = np.take(values, indices=range(start, end), axis=axis)
        with np.errstate(invalid="ignore"):
            reduced_slices.append(np.nanmean(subset, axis=axis))
    return np.stack(reduced_slices, axis=axis), np.array(reduced_axis, dtype=np.float64)


def _resample_frame(frame_values: np.ndarray, latitudes: np.ndarray, longitudes: np.ndarray, level: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    values = frame_values
    lats = latitudes
    lons = longitudes
    values, lats = _downsample_axis(values, lats, level["target_rows"], axis=0)
    values, lons = _downsample_axis(values, lons, level["target_cols"], axis=1)
    return values, lats, lons


def _tile_bounds(tile_lats: np.ndarray, tile_lons: np.ndarray, lat_step: float, lon_step: float) -> list[list[float]]:
    south = float(tile_lats[0] - lat_step / 2)
    north = float(tile_lats[-1] + lat_step / 2)
    west = float(tile_lons[0] - lon_step / 2)
    east = float(tile_lons[-1] + lon_step / 2)
    return [[west, south], [east, north]]


def _write_palette_tiles(
    frame_index: int,
    level_id: str,
    tile_x: int,
    tile_y: int,
    tile_values: np.ndarray,
    display_min: float,
    display_max: float,
) -> dict[str, int]:
    tile_dir = temperature_tile_root() / f"frame_{frame_index:03d}" / level_id
    size_by_palette: dict[str, int] = {}
    for palette_name in TEMPERATURE_TILE_PALETTES:
        palette_dir = tile_dir / palette_name
        palette_dir.mkdir(parents=True, exist_ok=True)
        tile_path = palette_dir / f"{tile_x}_{tile_y}.png"
        _render_overlay(tile_values, display_min, display_max, palette_name).save(tile_path)
        size_by_palette[palette_name] = tile_path.stat().st_size
    return size_by_palette


def _copenhagen_hour(timestamp_iso: str) -> int:
    local = pd.Timestamp(timestamp_iso).tz_convert(BALTIC_REGION["time_zone"])
    return int(local.hour)


def _nearest_frame_index(time_values: list[str]) -> int:
    current_utc = pd.Timestamp(datetime.now(timezone.utc))
    return min(range(len(time_values)), key=lambda idx: abs(pd.Timestamp(time_values[idx]) - current_utc))


def process_temperature_dataset(input_path: Path | None = None) -> None:
    load_dotenv()
    ensure_directories()

    source_path = Path(input_path) if input_path else raw_dataset_path()
    if not source_path.exists():
        raise FileNotFoundError(f"Raw dataset not found: {source_path}")

    download_sidecar = _load_download_sidecar()

    with xr.open_dataset(source_path) as dataset:
        lat_name = _find_coordinate_name(dataset, ["latitude", "lat"])
        lon_name = _find_coordinate_name(dataset, ["longitude", "lon"])
        surface = _surface_stack(dataset)

        latitudes = dataset[lat_name].values.astype(np.float64)
        longitudes = dataset[lon_name].values.astype(np.float64)
        values_celsius, original_units, converted_from_kelvin = _to_celsius(surface)
        time_values = _time_values_from_surface(surface)

        if values_celsius.ndim == 2:
            values_celsius = values_celsius[np.newaxis, :, :]

        if latitudes[0] > latitudes[-1]:
            latitudes = latitudes[::-1]
            values_celsius = values_celsius[:, ::-1, :]
        if longitudes[0] > longitudes[-1]:
            longitudes = longitudes[::-1]
            values_celsius = values_celsius[:, :, ::-1]

    valid_mask = np.any(np.isfinite(values_celsius), axis=0)
    display_min, display_max = _nice_display_range(values_celsius)
    land_mask_path = land_mask_output_path()
    meta_path = metadata_output_path()
    query_index_path = query_index_output_path()
    tile_root = temperature_tile_root()

    for existing in sorted(tile_root.glob("frame_*")):
        if existing.is_dir():
            for child in sorted(existing.rglob("*"), reverse=True):
                if child.is_file():
                    child.unlink()
                elif child.is_dir():
                    child.rmdir()
            existing.rmdir()

    _build_land_mask(valid_mask).save(land_mask_path)

    performance_levels: dict[str, dict[str, Any]] = {}
    frame_payloads: list[dict[str, Any]] = []

    for level in TEMPERATURE_TILE_LEVELS:
        level_id = level["id"]
        preview_values, preview_lats, preview_lons = _resample_frame(values_celsius[0], latitudes, longitudes, level)
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

        performance_levels[level_id] = {
            "id": level_id,
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

    tile_size_accumulator = {
        level["id"]: {palette_name: [] for palette_name in TEMPERATURE_TILE_PALETTES}
        for level in TEMPERATURE_TILE_LEVELS
    }

    for frame_index, timestamp_iso in enumerate(time_values):
        frame_values = values_celsius[frame_index]
        frame_valid = frame_values[np.isfinite(frame_values)]
        frame_payloads.append(
            {
                "index": frame_index,
                "time_utc": timestamp_iso,
                "display_label_local": pd.Timestamp(timestamp_iso).tz_convert(BALTIC_REGION["time_zone"]).strftime("%a %d %b, %H:%M"),
                "local_hour": _copenhagen_hour(timestamp_iso),
                "is_night": _copenhagen_hour(timestamp_iso) >= 21 or _copenhagen_hour(timestamp_iso) < 5,
                "min_celsius": round(float(frame_valid.min()), 2),
                "max_celsius": round(float(frame_valid.max()), 2),
            }
        )

        for level in TEMPERATURE_TILE_LEVELS:
            level_id = level["id"]
            resampled_values, _level_lats, _level_lons = _resample_frame(frame_values, latitudes, longitudes, level)
            for tile in performance_levels[level_id]["tiles"]:
                tile_values = resampled_values[tile["row_start"] : tile["row_end"], tile["column_start"] : tile["column_end"]]
                palette_sizes = _write_palette_tiles(
                    frame_index=frame_index,
                    level_id=level_id,
                    tile_x=tile["x"],
                    tile_y=tile["y"],
                    tile_values=tile_values,
                    display_min=display_min,
                    display_max=display_max,
                )
                if frame_index == 0:
                    for palette_name, size_bytes in palette_sizes.items():
                        tile_size_accumulator[level_id][palette_name].append(size_bytes)

    for level_id, palette_sizes in tile_size_accumulator.items():
        performance_levels[level_id]["average_tile_bytes"] = {
            palette_name: round(float(np.mean(values)), 1) if values else 0.0
            for palette_name, values in palette_sizes.items()
        }

    initial_frame_index = _nearest_frame_index(time_values)

    query_index_payload = {
        "latitudes": [round(float(value), 6) for value in latitudes.tolist()],
        "longitudes": [round(float(value), 6) for value in longitudes.tolist()],
        "times_utc": time_values,
        "values_celsius": [
            [
                [None if not np.isfinite(value) else round(float(value), 3) for value in row]
                for row in frame.tolist()
            ]
            for frame in values_celsius
        ],
    }
    query_index_path.write_text(json.dumps(query_index_payload), encoding="utf-8")

    raw_file_size = source_path.stat().st_size if source_path.exists() else 0
    level_byte_totals = {
        level_id: sum(
            (
                temperature_tile_root() / f"frame_{initial_frame_index:03d}" / level_id / "blueRed" / f"{tile['x']}_{tile['y']}.png"
            ).stat().st_size
            for tile in performance_levels[level_id]["tiles"]
        )
        for level_id in performance_levels
    }

    metadata_payload = {
        "layer": {
            "id": "temperature",
            "label": LAYER_LABEL,
            "variable": TEMPERATURE_VARIABLE,
        },
        "provenance": {
            "source": "Copernicus Marine",
            "product_id": download_sidecar.get("product_id", PRODUCT_ID),
            "dataset_id": download_sidecar.get("dataset_id", DATASET_ID),
            "type": download_sidecar.get("dataset_type", DATASET_TYPE),
            "retrieved_at_utc": download_sidecar.get("retrieved_at_utc"),
            "requested_start_utc": download_sidecar.get("requested_start_utc"),
            "requested_end_utc": download_sidecar.get("requested_end_utc"),
            "original_units": original_units,
            "display_units": "degC",
            "converted_from_kelvin": converted_from_kelvin,
        },
        "region": {
            "name": BALTIC_REGION["name"],
            "bbox": BBOX,
            "initial_view": INITIAL_VIEW,
            "max_bounds": BALTIC_REGION["max_bounds"],
            "time_zone": BALTIC_REGION["time_zone"],
        },
        "fallback": {
            "land_mask_url": WEB_LAND_MASK_URL,
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
            "palettes": TEMPERATURE_TILE_PALETTES,
            "tile_root_url": WEB_TILE_ROOT,
            "levels": list(performance_levels.values()),
        },
        "frames": frame_payloads,
        "initial_frame_index": initial_frame_index,
        "value_range_celsius": {
            "min": round(float(np.nanmin(values_celsius)), 2),
            "max": round(float(np.nanmax(values_celsius)), 2),
            "display_min": display_min,
            "display_max": display_max,
        },
        "files": {
            "metadata_url": WEB_METADATA_URL,
            "land_mask_filename": LAND_MASK_FILENAME,
            "metadata_filename": METADATA_FILENAME,
            "query_index_filename": QUERY_INDEX_FILENAME,
        },
        "performance": {
            "raw_source_bytes_per_window": raw_file_size,
            "processed_level_bytes": level_byte_totals,
            "average_tile_bytes": {
                level_id: performance_levels[level_id]["average_tile_bytes"].get("blueRed", 0.0)
                for level_id in performance_levels
            },
            "initial_overview_request_count": performance_levels["overview"]["tile_count"],
            "estimated_browser_memory_mb": round((performance_levels["overview"]["rows"] * performance_levels["overview"]["columns"] * 4) / 1_000_000, 2),
        },
    }
    meta_path.write_text(json.dumps(metadata_payload, indent=2), encoding="utf-8")

    print(f"Processed {len(frame_payloads)} Baltic forecast frames")
    print(f"Saved Baltic land mask to {land_mask_path}")
    print(f"Saved temperature query index to {query_index_path}")
    print(f"Saved Baltic metadata to {meta_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Process the raw Baltic temperature subset into multi-resolution tiled web assets.")
    parser.add_argument(
        "--input",
        type=Path,
        default=raw_dataset_path(),
        help="Path to the raw NetCDF subset produced by download_temperature.py",
    )
    args = parser.parse_args()
    process_temperature_dataset(args.input)


if __name__ == "__main__":
    main()
