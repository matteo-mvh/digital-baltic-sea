from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from data_pipeline.config import (
    BALTIC_REGION,
    FRONTEND_DIR,
    SITE_URL_ENV_VAR,
    SITE_DATA_ROOT,
    SITE_DIR,
)
from data_pipeline.ocean_layers import OCEAN_CONDITION_ORDER, ocean_condition_definitions


def _copy_tree(source: Path, target: Path) -> None:
    if not source.exists():
        return
    shutil.copytree(source, target, dirs_exist_ok=True)


def _fetch_bytes(url: str) -> bytes | None:
    request = urlrequest.Request(
        url,
        headers={
            "User-Agent": "Digital-Baltic-Build/1.0",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    try:
        with urlrequest.urlopen(request, timeout=20) as response:
            if getattr(response, "status", 200) >= 400:
                return None
            return response.read()
    except (urlerror.HTTPError, urlerror.URLError):
        return None


def _restore_remote_ocean_data(data_target: Path) -> bool:
    site_url = os.getenv(SITE_URL_ENV_VAR, "").rstrip("/")
    if not site_url:
        return False

    manifest_url = f"{site_url}/data/ocean/manifest.json?source=build-site"
    manifest_bytes = _fetch_bytes(manifest_url)
    if not manifest_bytes:
        return False

    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
    except json.JSONDecodeError:
        return False

    ocean_root = data_target / "ocean"
    ocean_root.mkdir(parents=True, exist_ok=True)
    (ocean_root / "manifest.json").write_bytes(manifest_bytes)

    restored_any = False
    for condition in manifest.get("conditions", []):
        metadata = condition.get("metadata")
        condition_id = condition.get("id")
        if not metadata or not condition_id:
            continue

        condition_root = ocean_root / str(condition_id)
        condition_root.mkdir(parents=True, exist_ok=True)

        files_to_restore = {
            "manifest.json": metadata.get("files", {}).get("metadata_url"),
            "query_index.json": metadata.get("query_index_url"),
            "land_mask.png": metadata.get("fallback", {}).get("land_mask_url"),
        }
        restored_condition = True
        for filename, relative_url in files_to_restore.items():
            if not relative_url:
                restored_condition = False
                continue
            remote_url = f"{site_url}/{str(relative_url).lstrip('./')}?source=build-site"
            payload = _fetch_bytes(remote_url)
            if payload is None:
                restored_condition = False
                continue
            (condition_root / filename).write_bytes(payload)
        query_index_path = condition_root / "query_index.json"
        try:
            query_index = json.loads(query_index_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            restored_condition = False
            query_index = {}
        for frame_entry in query_index.get("frames", []):
            frame_relative_url = str(frame_entry.get("data_url", "")).lstrip("./")
            frame_key = frame_entry.get("key")
            if not frame_relative_url or not frame_key:
                continue
            frame_payload = _fetch_bytes(f"{site_url}/{frame_relative_url}?source=build-site")
            if frame_payload is None:
                restored_condition = False
                continue
            frame_root = condition_root / "frames"
            frame_root.mkdir(parents=True, exist_ok=True)
            (frame_root / f"{frame_key}.json").write_bytes(frame_payload)
        restored_any = restored_any or restored_condition

    return restored_any


def _placeholder_manifest() -> dict[str, object]:
    definitions = ocean_condition_definitions()
    conditions = [
        {
            "id": condition_id,
            "label": definitions[condition_id]["label"],
            "available": False,
            "condition": definitions[condition_id],
        }
        for condition_id in OCEAN_CONDITION_ORDER
    ]
    return {
        "region": {
            "name": BALTIC_REGION["name"],
            "bbox": BALTIC_REGION["bbox"],
            "initial_view": {
                "center": BALTIC_REGION["default_center"],
                "zoom": BALTIC_REGION["default_zoom"],
            },
            "max_bounds": BALTIC_REGION["max_bounds"],
            "time_zone": BALTIC_REGION["time_zone"],
        },
        "default_condition_id": "temperature",
        "conditions": conditions,
    }


def build_site() -> None:
    if SITE_DIR.exists():
        shutil.rmtree(SITE_DIR)
    SITE_DIR.mkdir(parents=True, exist_ok=True)

    for filename in ("index.html", "app.js", "styles.css", "ocean-data.mjs"):
        shutil.copy2(FRONTEND_DIR / filename, SITE_DIR / filename)

    _copy_tree(FRONTEND_DIR / "locales", SITE_DIR / "locales")
    _copy_tree(FRONTEND_DIR / "infrastructure", SITE_DIR / "infrastructure")
    _copy_tree(FRONTEND_DIR / "noise", SITE_DIR / "noise")

    data_target = SITE_DIR / "data"
    if SITE_DATA_ROOT.exists():
        _copy_tree(SITE_DATA_ROOT, data_target)
    else:
        _restore_remote_ocean_data(data_target)

    manifest_path = data_target / "ocean" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if not manifest_path.exists():
        manifest_path.write_text(json.dumps(_placeholder_manifest(), indent=2), encoding="utf-8")

    (SITE_DIR / ".nojekyll").write_text("", encoding="utf-8")


if __name__ == "__main__":
    build_site()
