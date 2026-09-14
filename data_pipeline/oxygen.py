"""Bottom oxygen extraction from the existing model product, during manual updates only."""
from __future__ import annotations

import numpy as np


def bottom_values(values: np.ndarray, depths_m: np.ndarray, depth_axis: int) -> tuple[np.ndarray, np.ndarray]:
    """Return deepest non-missing value and its model depth for each water column.

    Depth varies with local bathymetry. Zero oxygen is valid. Negative oxygen is
    preserved for the caller's validation to reject, never replaced with a
    shallower value. An all-missing column remains missing, including on land.
    """
    depths = np.asarray(depths_m, dtype=np.float64)
    if depths.ndim != 1 or len(depths) < 2 or not np.all(np.isfinite(depths)) or np.any(depths < 0):
        raise ValueError("Bottom oxygen requires multiple finite, positive-down model depths in metres.")
    if len(np.unique(depths)) != len(depths):
        raise ValueError("Duplicate model depth coordinates.")
    columns = np.moveaxis(np.asarray(values, dtype=np.float32), depth_axis, 0)
    if columns.shape[0] != len(depths):
        raise ValueError("Depth coordinate does not match oxygen array.")
    order = np.argsort(depths)
    columns, depths = columns[order], depths[order]
    present = np.isfinite(columns)
    wet = present.any(axis=0)
    index = len(depths) - 1 - np.argmax(present[::-1], axis=0)
    selected = np.take_along_axis(columns, index[np.newaxis, ...], axis=0)[0]
    return np.where(wet, selected, np.nan), np.where(wet, depths[index], np.nan).astype(np.float32)


def compatible_vertical_selection(config: dict, metadata: dict | None) -> bool:
    if config.get("id") != "oxygen" or config.get("depth") != "bottom":
        return True
    return (metadata or {}).get("condition", {}).get("depth_mode") == "bottom"
