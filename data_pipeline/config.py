from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed" / "latest"
SITE_DATA_ROOT = DATA_DIR / "processed" / "site"
SITE_OCEAN_ROOT = SITE_DATA_ROOT / "ocean"
SITE_DIR = PROJECT_ROOT / "site"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
TEMPORARY_WORK_ROOT = PROJECT_ROOT / ".cache" / "copernicus"

COPERNICUS_USERNAME_ENV_VARS = (
    "COPERNICUS_USERNAME",
    "COPERNICUSMARINE_SERVICE_USERNAME",
)
COPERNICUS_PASSWORD_ENV_VARS = (
    "COPERNICUS_PASSWORD",
    "COPERNICUSMARINE_SERVICE_PASSWORD",
)
SITE_URL_ENV_VAR = "DIGITAL_BALTIC_SITE_URL"

OPERATIONAL_HISTORY_DAYS = 1
OPERATIONAL_FORECAST_DAYS = 2
FORECAST_REFRESH_HOURS = 18
MAX_TEMPORARY_DISK_GB = 5
MAX_RUNNER_RAM_GB = 8
DEFAULT_DOWNLOAD_INTERVAL_MINUTES = 60

BALTIC_REGION = {
    "name": "Baltic Sea",
    "bbox": {
        "minimum_longitude": 9.0,
        "maximum_longitude": 31.5,
        "minimum_latitude": 53.0,
        "maximum_latitude": 66.0,
    },
    "default_center": [20.0, 59.5],
    "default_zoom": 4.5,
    "max_bounds": [
        [8.2, 52.6],
        [32.1, 66.5],
    ],
    "time_zone": "Europe/Copenhagen",
}

BBOX = BALTIC_REGION["bbox"]

INITIAL_VIEW = {
    "center": BALTIC_REGION["default_center"],
    "zoom": BALTIC_REGION["default_zoom"],
}

OCEAN_DATASETS = {
    "temperature": {
        "id": "temperature",
        "label": "Surface temperature",
        "product_id": "BALTICSEA_ANALYSISFORECAST_PHY_003_006",
        "dataset_id": "cmems_mod_bal_phy_anfc_PT1H-i",
        "dataset_type": "Modelled analysis and forecast",
        "processor": "temperature",
        "variable": "thetao",
        "variables": ["thetao"],
        "primary_variable": "thetao",
        "units": "degC",
        "value_key": "value_celsius",
        "query_value_key": "values_celsius",
        "palettes": ["blueRed", "greenRed", "grayscale", "yellowBlue"],
        "default_palette": "blueRed",
        "depth": "surface",
        "vertical_subset": {
            "minimum_depth": 0.0,
            "maximum_depth": 0.0,
            "coordinates_selection_method": "nearest",
        },
        "plausible_range": [-5.0, 40.0],
        "bounds": [
            BBOX["minimum_longitude"],
            BBOX["minimum_latitude"],
            BBOX["maximum_longitude"],
            BBOX["maximum_latitude"],
        ],
        "history_days": OPERATIONAL_HISTORY_DAYS,
        "forecast_days": OPERATIONAL_FORECAST_DAYS,
        "refresh_hours": FORECAST_REFRESH_HOURS,
        "download_interval_minutes": DEFAULT_DOWNLOAD_INTERVAL_MINUTES,
    },
    "salinity": {
        "id": "salinity",
        "label": "Salinity",
        "product_id": "BALTICSEA_ANALYSISFORECAST_PHY_003_006",
        "dataset_id": "cmems_mod_bal_phy_anfc_PT1H-i",
        "dataset_type": "Modelled analysis and forecast",
        "processor": "scalar",
        "variable": "so",
        "variables": ["so"],
        "primary_variable": "so",
        "units": "PSU",
        "value_key": "value_psu",
        "query_value_key": "values_primary",
        "palettes": ["default"],
        "default_palette": "yellowBlue",
        "depth": "surface",
        "vertical_subset": {
            "minimum_depth": 0.0,
            "maximum_depth": 0.0,
            "coordinates_selection_method": "nearest",
        },
        "plausible_range": [0.0, 40.0],
        "bounds": [
            BBOX["minimum_longitude"],
            BBOX["minimum_latitude"],
            BBOX["maximum_longitude"],
            BBOX["maximum_latitude"],
        ],
        "history_days": OPERATIONAL_HISTORY_DAYS,
        "forecast_days": OPERATIONAL_FORECAST_DAYS,
        "refresh_hours": FORECAST_REFRESH_HOURS,
        "download_interval_minutes": DEFAULT_DOWNLOAD_INTERVAL_MINUTES,
    },
    "currents": {
        "id": "currents",
        "label": "Currents",
        "product_id": "BALTICSEA_ANALYSISFORECAST_PHY_003_006",
        "dataset_id": "cmems_mod_bal_phy_anfc_PT15M-i",
        "dataset_type": "Modelled analysis and forecast",
        "processor": "currents",
        "variable": "currents",
        "variables": ["uo", "vo"],
        "primary_variable": "speed",
        "units": "m/s",
        "value_key": "speed_mps",
        "query_value_key": "values_primary",
        "palettes": ["default"],
        "default_palette": "greenRed",
        "depth": "surface",
        "vertical_subset": {
            "minimum_depth": 0.0,
            "maximum_depth": 0.0,
            "coordinates_selection_method": "nearest",
        },
        "plausible_range": [0.0, 8.0],
        "bounds": [
            BBOX["minimum_longitude"],
            BBOX["minimum_latitude"],
            BBOX["maximum_longitude"],
            BBOX["maximum_latitude"],
        ],
        "history_days": 1,
        "forecast_days": 2,
        "refresh_hours": 12,
        "download_interval_minutes": DEFAULT_DOWNLOAD_INTERVAL_MINUTES,
    },
    "oxygen": {
        "id": "oxygen",
        "label": "Bottom dissolved oxygen",
        "product_id": "BALTICSEA_ANALYSISFORECAST_BGC_003_007",
        "dataset_id": "cmems_mod_bal_bgc_anfc_P1D-m",
        "dataset_type": "Modelled analysis and forecast",
        "processor": "scalar",
        "variable": "o2",
        "variables": ["o2"],
        "primary_variable": "o2",
        "units": "mmol/m^3",
        "value_key": "value_mmol_m3",
        "query_value_key": "values_primary",
        "palettes": ["default"],
        "default_palette": "oxygen",
        "depth": "bottom",  # Full vertical column; reduced locally at each wet grid cell.
        "depth_label": "Deepest available model level at each location (depth varies)",
        "plausible_range": [0.0, 600.0],
        "bounds": [
            BBOX["minimum_longitude"],
            BBOX["minimum_latitude"],
            BBOX["maximum_longitude"],
            BBOX["maximum_latitude"],
        ],
        "history_days": OPERATIONAL_HISTORY_DAYS,
        "forecast_days": OPERATIONAL_FORECAST_DAYS,
        "refresh_hours": 24,
        "download_interval_minutes": DEFAULT_DOWNLOAD_INTERVAL_MINUTES,
    },
    "waves": {
        "id": "waves",
        "label": "Waves",
        "product_id": "BALTICSEA_ANALYSISFORECAST_WAV_003_010",
        "dataset_id": "cmems_mod_bal_wav_anfc_PT1H-i",
        "dataset_type": "Modelled analysis and forecast",
        "processor": "waves",
        "variable": "waves",
        "variables": ["VHM0", "VMDR", "VTM10"],
        "primary_variable": "VHM0",
        "units": "m",
        "value_key": "significant_height_m",
        "query_value_key": "values_primary",
        "palettes": ["default"],
        "default_palette": "yellowBlue",
        "depth": "surface",
        "plausible_range": [0.0, 25.0],
        "bounds": [
            BBOX["minimum_longitude"],
            BBOX["minimum_latitude"],
            BBOX["maximum_longitude"],
            BBOX["maximum_latitude"],
        ],
        "history_days": OPERATIONAL_HISTORY_DAYS,
        "forecast_days": OPERATIONAL_FORECAST_DAYS,
        "refresh_hours": FORECAST_REFRESH_HOURS,
        "download_interval_minutes": DEFAULT_DOWNLOAD_INTERVAL_MINUTES,
    },
    "seaLevel": {
        "id": "seaLevel",
        "label": "Sea level",
        "product_id": "BALTICSEA_ANALYSISFORECAST_PHY_003_006",
        "dataset_id": "cmems_mod_bal_phy_anfc_PT1H-i",
        "dataset_type": "Modelled analysis and forecast",
        "processor": "scalar",
        "variable": "zos",
        "variables": ["zos"],
        "primary_variable": "zos",
        "units": "m",
        "value_key": "value_m",
        "query_value_key": "values_primary",
        "palettes": ["default"],
        "default_palette": "blueRed",
        "depth": "surface",
        "plausible_range": [-5.0, 5.0],
        "bounds": [
            BBOX["minimum_longitude"],
            BBOX["minimum_latitude"],
            BBOX["maximum_longitude"],
            BBOX["maximum_latitude"],
        ],
        "history_days": OPERATIONAL_HISTORY_DAYS,
        "forecast_days": OPERATIONAL_FORECAST_DAYS,
        "refresh_hours": FORECAST_REFRESH_HOURS,
        "download_interval_minutes": DEFAULT_DOWNLOAD_INTERVAL_MINUTES,
    }
}

TEMPERATURE_DATASET = OCEAN_DATASETS["temperature"]
PRODUCT_ID = TEMPERATURE_DATASET["product_id"]
DATASET_ID = TEMPERATURE_DATASET["dataset_id"]
TEMPERATURE_VARIABLE = TEMPERATURE_DATASET["variable"]
LAYER_NAME = "sea_surface_temperature"
LAYER_LABEL = "Sea surface temperature"
DATASET_TYPE = TEMPERATURE_DATASET["dataset_type"]

TEMPERATURE_TILE_LEVELS = [
    {
        "id": "overview",
        "zoom_min": 0.0,
        "zoom_max": 5.9,
        "target_rows": 96,
        "target_cols": 168,
        "tile_rows": 96,
        "tile_cols": 96,
        "preload_ring": 1,
    },
    {
        "id": "regional",
        "zoom_min": 6.0,
        "zoom_max": 7.9,
        "target_rows": 192,
        "target_cols": 336,
        "tile_rows": 96,
        "tile_cols": 96,
        "preload_ring": 1,
    },
    {
        "id": "local",
        "zoom_min": 8.0,
        "zoom_max": 24.0,
        "target_rows": None,
        "target_cols": None,
        "tile_rows": 128,
        "tile_cols": 128,
        "preload_ring": 1,
    },
]

TEMPERATURE_TILE_PALETTES = ["blueRed", "greenRed", "grayscale", "yellowBlue"]

RAW_DATA_FILENAME = "temperature_latest.nc"
RAW_DOWNLOAD_METADATA_FILENAME = "temperature_latest_download.json"
LAND_MASK_FILENAME = "land_mask.png"
METADATA_FILENAME = "temperature_metadata.json"
QUERY_INDEX_FILENAME = "temperature_query_index.json"
TILE_DIRECTORY_NAME = "temperature_tiles"

WEB_PROCESSED_ROOT = "../data/processed/latest"
WEB_LAND_MASK_URL = f"{WEB_PROCESSED_ROOT}/{LAND_MASK_FILENAME}"
WEB_METADATA_URL = f"{WEB_PROCESSED_ROOT}/{METADATA_FILENAME}"
WEB_TILE_ROOT = f"{WEB_PROCESSED_ROOT}/{TILE_DIRECTORY_NAME}"

COLOR_STOPS = [
    (0.00, (14, 42, 79)),
    (0.20, (21, 93, 146)),
    (0.45, (49, 168, 188)),
    (0.65, (121, 214, 178)),
    (0.82, (246, 206, 102)),
    (1.00, (225, 103, 63)),
]

GREEN_RED_COLOR_STOPS = [
    (0.00, (16, 79, 42)),
    (0.24, (47, 143, 70)),
    (0.50, (138, 203, 90)),
    (0.72, (241, 223, 114)),
    (0.88, (240, 139, 73)),
    (1.00, (179, 32, 32)),
]

GRAYSCALE_COLOR_STOPS = [
    (0.00, (18, 18, 18)),
    (0.20, (58, 58, 58)),
    (0.45, (112, 112, 112)),
    (0.70, (179, 179, 179)),
    (1.00, (244, 244, 244)),
]

YELLOW_BLUE_COLOR_STOPS = [
    (0.00, (255, 225, 106)),
    (0.20, (246, 200, 95)),
    (0.42, (155, 208, 224)),
    (0.65, (79, 149, 209)),
    (0.84, (36, 89, 166)),
    (1.00, (16, 43, 109)),
]

PALETTE_COLOR_STOPS = {
    "oxygen": [(0.0, (68, 1, 84)), (0.25, (59, 82, 139)), (0.5, (33, 145, 140)), (0.75, (94, 201, 98)), (1.0, (253, 231, 37))],
    "blueRed": COLOR_STOPS,
    "greenRed": GREEN_RED_COLOR_STOPS,
    "grayscale": GRAYSCALE_COLOR_STOPS,
    "yellowBlue": YELLOW_BLUE_COLOR_STOPS,
}


def ensure_directories() -> None:
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    SITE_OCEAN_ROOT.mkdir(parents=True, exist_ok=True)
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    TEMPORARY_WORK_ROOT.mkdir(parents=True, exist_ok=True)
    temperature_tile_root().mkdir(parents=True, exist_ok=True)


def raw_dataset_path() -> Path:
    return RAW_DATA_DIR / RAW_DATA_FILENAME


def raw_download_metadata_path() -> Path:
    return RAW_DATA_DIR / RAW_DOWNLOAD_METADATA_FILENAME


def land_mask_output_path() -> Path:
    return PROCESSED_DATA_DIR / LAND_MASK_FILENAME


def metadata_output_path() -> Path:
    return PROCESSED_DATA_DIR / METADATA_FILENAME


def query_index_output_path() -> Path:
    return PROCESSED_DATA_DIR / QUERY_INDEX_FILENAME


def temperature_tile_root() -> Path:
    return PROCESSED_DATA_DIR / TILE_DIRECTORY_NAME


def site_condition_root(condition_id: str) -> Path:
    return SITE_OCEAN_ROOT / condition_id
