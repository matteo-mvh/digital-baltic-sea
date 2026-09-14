import { formatTimestamp as formatUtcTimestamp, readableUnit, nonnegativeQuantity, displayRangeForMetadata, cleanFrame, nearestFrameIndexForTimestamp, forecastArchived, intervalLabel as publishedIntervalLabel } from "./ocean-data.mjs";

const OCEAN_MANIFEST_URL = new URL("./data/ocean/manifest.json", window.location.href).toString();
const MAPLIBRE_JS_URL = "https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.js";
const INFRASTRUCTURE_MANIFEST_URL = new URL("./infrastructure/manifest.json", window.location.href).toString();

const EOX_SATELLITE_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg";
const EOX_LABELS_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/overlay_base_3857/default/g/{z}/{y}/{x}.png";
const EOX_STREETS_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/streets_3857/default/g/{z}/{y}/{x}.png";
const EOX_BRIGHT_LABELS_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/overlay_base_bright_3857/default/g/{z}/{y}/{x}.png";
const EOX_BLACKMARBLE_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/blackmarble_3857/default/g/{z}/{y}/{x}.jpg";
const EOX_COASTLINE_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/coastline_3857/default/g/{z}/{y}/{x}.png";

const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", short: "EN", enabled: true },
  { code: "da", label: "Dansk", short: "DA", enabled: true },
  { code: "de", label: "Deutsch", short: "DE", enabled: true },
  { code: "pl", label: "Polski", short: "PL", enabled: false },
  { code: "lt", label: "Lietuvių", short: "LT", enabled: false },
  { code: "lv", label: "Latviešu", short: "LV", enabled: false },
  { code: "et", label: "Eesti", short: "ET", enabled: false },
  { code: "fi", label: "Suomi", short: "FI", enabled: false },
  { code: "sv", label: "Svenska", short: "SV", enabled: false },
  { code: "ru", label: "Русский", short: "RU", enabled: false }
];

const bodyEl = document.body;
const paletteButtonEl = document.getElementById("palette-button");
const paletteCurrentEl = document.getElementById("palette-current");
const paletteMenuEl = document.getElementById("palette-menu");
const languageButtonEl = document.getElementById("language-button");
const languageCurrentEl = document.getElementById("language-current");
const languageMenuEl = document.getElementById("language-menu");
const heroEnterMapEl = document.getElementById("hero-enter-map");
const topEnterMapEl = document.getElementById("enter-map-top");
const previewEnterMapEl = document.getElementById("preview-enter-map");
const exitMapEl = document.getElementById("exit-map");
const mapContainerEl = document.getElementById("map");
const viewToggleEl = document.getElementById("view-toggle");
const temperatureToggleEl = document.getElementById("temperature-toggle");
const currentsToggleEl = document.getElementById("currents-toggle");
const salinityToggleEl = document.getElementById("salinity-toggle");
const oxygenToggleEl = document.getElementById("oxygen-toggle");
const wavesToggleEl = document.getElementById("waves-toggle");
const seaLevelToggleEl = document.getElementById("sea-level-toggle");
const noiseToggleEl = document.getElementById("noise-toggle");
const noisePanelEl = document.getElementById("noise-panel");
const noiseCategoryListEl = document.getElementById("noise-category-list");
const noiseLegendEl = document.getElementById("noise-legend");
const infrastructureToggleEl = document.getElementById("infrastructure-toggle");
const infrastructurePanelEl = document.getElementById("infrastructure-panel");
const infrastructureCategoryListEl = document.getElementById("infrastructure-category-list");
const infrastructureLegendEl = document.getElementById("infrastructure-legend");
const overlayInfoPanelEl = document.getElementById("overlay-info-panel");
const overlayInfoTitleEl = document.getElementById("overlay-info-title");
const overlayInfoSubtitleEl = document.getElementById("overlay-info-subtitle");
const overlayInfoBodyEl = document.getElementById("overlay-info-body");
const overlayInfoCloseEl = document.getElementById("overlay-info-close");
const mapBottomLeftEl = document.getElementById("map-bottom-left");
const activeOverlayControlsEl = document.getElementById("active-overlay-controls");
const timeSliderEl = document.getElementById("time-slider");
const timePrimaryEl = document.getElementById("time-primary");
const timeSecondaryEl = document.getElementById("time-secondary");
const oceanConditionPanelEl = document.getElementById("ocean-condition-panel");
const oceanConditionCardLabelEl = document.getElementById("ocean-condition-card-label");
const oceanConditionCardSummaryEl = document.getElementById("ocean-condition-card-summary");
const oceanConditionCurrentValueEl = document.getElementById("ocean-condition-current-value");
const oceanConditionCurrentNoteEl = document.getElementById("ocean-condition-current-note");
const oceanConditionLegendEl = document.getElementById("ocean-condition-legend");
const oceanConditionLegendTitleEl = document.getElementById("ocean-condition-legend-title");
const oceanConditionLegendRangeEl = document.getElementById("ocean-condition-legend-range");
const oceanConditionLegendBarEl = document.getElementById("ocean-condition-legend-bar");
const oceanConditionLegendMinEl = document.getElementById("ocean-condition-legend-min");
const oceanConditionLegendUnitEl = document.getElementById("ocean-condition-legend-unit");
const oceanConditionLegendMaxEl = document.getElementById("ocean-condition-legend-max");
const oceanConditionRenderModeListEl = document.getElementById("ocean-condition-render-mode-list");
const oceanConditionPlaceholderEl = document.getElementById("ocean-condition-placeholder");
const mapHeadlineTitleEl = document.getElementById("map-headline-title");
const mapHeadlineTimeEl = document.getElementById("map-headline-time");
const sourceSummaryEl = document.getElementById("source-summary");
const sourceDetailEl = document.getElementById("source-detail");
const transparencyDetailEl = document.getElementById("transparency-detail");
const clickPanelEl = document.getElementById("click-panel");
const clickedPrimaryValueEl = document.getElementById("clicked-primary-value");
const clickedLayerNameEl = document.getElementById("clicked-layer-name");
const clickedTimeEl = document.getElementById("clicked-time");
const clickedCoordinatesEl = document.getElementById("clicked-coordinates");
const legendPanelEl = document.getElementById("legend-panel");
const legendRangeEl = document.getElementById("legend-range");
const legendMinEl = document.getElementById("legend-min");
const legendMaxEl = document.getElementById("legend-max");
const statusPanelEl = document.getElementById("status-panel");
const statusMessageEl = document.getElementById("status-message");
const paletteOptionEls = Array.from(document.querySelectorAll("[data-palette]"));
const palettePreviewEls = Array.from(document.querySelectorAll("[data-palette-preview]"));
const controlCardToggleEls = Array.from(document.querySelectorAll("[data-control-card-toggle]"));
const overlayInfoButtonEls = Array.from(document.querySelectorAll("[data-overlay-info-button]"));

const OCEAN_CONDITION_ORDER = ["temperature", "currents", "salinity", "oxygen", "waves", "seaLevel"];

const OCEAN_CONDITION_BUTTONS = {
  temperature: temperatureToggleEl,
  currents: currentsToggleEl,
  salinity: salinityToggleEl,
  oxygen: oxygenToggleEl,
  waves: wavesToggleEl,
  seaLevel: seaLevelToggleEl
};

const CONTROL_CARD_ELEMENTS = {
  oceanCondition: oceanConditionPanelEl,
  noise: noisePanelEl,
  infrastructure: infrastructurePanelEl
};

const CONTROL_CARD_DEFINITIONS = {
  oceanCondition: {
    controlPriority: 10,
    active: () => Boolean(activeConditionDefinition()),
    summary: () => oceanConditionCardSummary()
  },
  noise: {
    controlPriority: 30,
    active: () => state.noise.active,
    summary: () => `${activeNoiseCategoryCount()} ${msg(activeNoiseCategoryCount() === 1 ? "layer" : "layers")}`
  },
  infrastructure: {
    controlPriority: 40,
    active: () => state.infrastructure.active,
    summary: () =>
      `${activeInfrastructureCategoryCount()} ${msg(activeInfrastructureCategoryCount() === 1 ? "layer" : "layers")}`
  }
};

const OCEAN_CONDITION_PLACEHOLDERS = {
  temperature: {
    title: "Surface temperature placeholder",
    copy: "This card is ready for the shared time control, live colour legend, and local value sampling once processed temperature frames are available."
  },
  currents: {
    title: "Currents placeholder",
    copy: "This card is ready for shared time, speed legend, and planned current-direction visualization modes while the processed current dataset is prepared."
  },
  salinity: {
    title: "Salinity placeholder",
    copy: "This card is ready for shared time and a salinity colour legend as soon as local salinity frames are added."
  },
  oxygen: {
    title: "Oxygen placeholder",
    copy: "This card is ready for shared time and an oxygen legend, with room for future depth-aware controls when the dataset arrives."
  },
  waves: {
    title: "Waves placeholder",
    copy: "This card is ready for shared time, wave-height legend, and planned animation modes while the processed wave frames are still pending."
  },
  seaLevel: {
    title: "Sea level placeholder",
    copy: "This card is ready for shared time and a sea-level legend as soon as local sea-level frames are added."
  }
};

const INFRASTRUCTURE_CATEGORY_ORDER = [
  "ports",
  "powerPlants",
  "windFarms",
  "cables",
  "pipelines",
  "shipping",
  "landUse"
];

const INFRASTRUCTURE_STYLES = {
  ports: {
    layerType: "circle",
    labelKey: "infrastructure.ports",
    fallbackLabel: "Ports & harbours",
    styleLabelKey: "infrastructure.stylePoint",
    styleFallback: "Point markers",
    legendType: "point",
    color: "#92d8d0",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 12, 7, 15, 10],
      "circle-color": "#92d8d0",
      "circle-stroke-color": "#081623",
      "circle-stroke-width": 1.6,
      "circle-opacity": 0.92
    }
  },
  powerPlants: {
    layerType: "circle",
    labelKey: "infrastructure.powerPlants",
    fallbackLabel: "Power plants",
    styleLabelKey: "infrastructure.stylePoint",
    styleFallback: "Point markers",
    legendType: "point",
    color: "#f2a85a",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 12, 6.5, 15, 9],
      "circle-color": "#f2a85a",
      "circle-stroke-color": "#081623",
      "circle-stroke-width": 1.6,
      "circle-opacity": 0.92
    }
  },
  windFarms: {
    layerType: "fill",
    labelKey: "infrastructure.windFarms",
    fallbackLabel: "Offshore wind farms",
    styleLabelKey: "infrastructure.stylePolygon",
    styleFallback: "Polygon zones",
    legendType: "fill",
    color: "rgba(123, 208, 198, 0.2)",
    lineColor: "#7bd0c6",
    paint: {
      "fill-color": "#7bd0c6",
      "fill-opacity": 0.18
    },
    outlinePaint: {
      "line-color": "#8ee3d4",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 12, 1.4],
      "line-opacity": 0.9
    }
  },
  cables: {
    layerType: "line",
    labelKey: "infrastructure.cables",
    fallbackLabel: "Submarine cables",
    styleLabelKey: "infrastructure.styleLine",
    styleFallback: "Thin lines",
    legendType: "line",
    color: "#6bc1ff",
    paint: {
      "line-color": "#6bc1ff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2.2],
      "line-opacity": 0.82
    }
  },
  pipelines: {
    layerType: "line",
    labelKey: "infrastructure.pipelines",
    fallbackLabel: "Pipelines",
    styleLabelKey: "infrastructure.styleDashed",
    styleFallback: "Dashed lines",
    legendType: "dashed",
    color: "#e0b86a",
    paint: {
      "line-color": "#e0b86a",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2.2],
      "line-dasharray": [2, 1.3],
      "line-opacity": 0.82
    }
  },
  shipping: {
    layerType: "line",
    labelKey: "infrastructure.shipping",
    fallbackLabel: "Shipping routes",
    styleLabelKey: "infrastructure.styleCorridor",
    styleFallback: "Traffic corridors",
    legendType: "route",
    color: "rgba(111, 170, 230, 0.55)",
    paint: {
      "line-color": "#6fa9e6",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 4, 12, 10],
      "line-blur": 1.1,
      "line-opacity": 0.34
    },
    accentPaint: {
      "line-color": "#9dd4ff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2.2],
      "line-opacity": 0.6
    }
  },
  landUse: {
    layerType: "fill",
    labelKey: "infrastructure.landUse",
    fallbackLabel: "General land use",
    styleLabelKey: "infrastructure.styleMutedFill",
    styleFallback: "Muted land overlay",
    legendType: "fill",
    color: "rgba(138, 175, 120, 0.16)",
    lineColor: "rgba(188, 215, 164, 0.45)",
    paint: {
      "fill-color": [
        "match",
        ["get", "land_use"],
        "Urban / built-up", "#9096b5",
        "Agriculture", "#b7a25f",
        "Forest", "#3f6d44",
        "Wetlands / natural areas", "#5e8f84",
        "Industrial areas", "#86625b",
        "#7b8f78"
      ],
      "fill-opacity": 0.14
    },
    outlinePaint: {
      "line-color": "rgba(215, 225, 232, 0.18)",
      "line-width": 0.8,
      "line-opacity": 0.55
    }
  }
};

const NOISE_LAYER_DEFINITIONS = {
  continuousNoise: {
    labelKey: "noise.continuousNoise",
    fallbackLabel: "Continuous noise",
    type: "raster",
    source: "HELCOM HOLAS 3 / HELCOM MADS",
    period: "2016-2021 assessment",
    units: "Assessment pressure, not dB",
    tiles: [
      "https://maps.helcom.fi/arcgis/rest/services/MADS/Pressures/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&layers=show:201&f=image"
    ],
    paint: { "raster-opacity": 0.56, "raster-fade-duration": 0 },
    legendLabelKey: "noise.legendContinuous",
    legendFallback: "HELCOM continuous-noise pressure"
  },
  impulsiveEvents: {
    labelKey: "noise.impulsiveEvents",
    fallbackLabel: "Noise events",
    type: "events",
    source: "HELCOM HOLAS 3 / HELCOM-OSPAR impulsive noise register",
    period: "2016-2021",
    pointsUrl:
      "https://maps.helcom.fi/arcgis/rest/services/MADS/Indicators_and_assessments/MapServer/413/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson",
    polygonsUrl:
      "https://maps.helcom.fi/arcgis/rest/services/MADS/Indicators_and_assessments/MapServer/412/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson",
    legendLabelKey: "noise.legendEvents",
    legendFallback: "Reported impulsive events"
  },
  impulsivePressure: {
    labelKey: "noise.impulsivePressure",
    fallbackLabel: "Impulsive noise pressure",
    type: "raster",
    source: "HELCOM HOLAS 3 Dataset (2023)",
    period: "2016-2021",
    units: "Normalized pressure index",
    tiles: [
      "https://maps.helcom.fi/arcgis/rest/services/MADS/Pressures/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&layers=show:202&f=image"
    ],
    paint: { "raster-opacity": 0.52, "raster-fade-duration": 0 },
    legendLabelKey: "noise.legendImpulsivePressure",
    legendFallback: "HELCOM impulsive-noise pressure"
  },
  ecologicalEffect: {
    labelKey: "noise.ecologicalEffect",
    fallbackLabel: "Noise impact on mobile species",
    type: "raster",
    source: "HELCOM HOLAS 3 SPIA",
    period: "2016-2021",
    units: "Ecological impact index",
    tiles: [
      "https://maps.helcom.fi/arcgis/rest/services/MADS/Pressures/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&layers=show:223&f=image"
    ],
    paint: { "raster-opacity": 0.5, "raster-fade-duration": 0 },
    legendLabelKey: "noise.legendImpact",
    legendFallback: "Potential impact on mobile species"
  }
};

const NOISE_CATEGORY_ORDER = ["continuousNoise", "impulsiveEvents", "impulsivePressure", "ecologicalEffect"];

const NOISE_EVENT_GROUPS = {
  pile_driving: { labelKey: "noise.eventPileDriving", fallbackLabel: "Pile driving", color: "#f3b067" },
  seismic_airgun: { labelKey: "noise.eventSeismic", fallbackLabel: "Seismic / airguns", color: "#dd7862" },
  explosion: { labelKey: "noise.eventExplosion", fallbackLabel: "Explosions", color: "#f05a7b" },
  sonar_deterrent: { labelKey: "noise.eventSonar", fallbackLabel: "Sonar / deterrents", color: "#8f8ef7" },
  other_impulsive: { labelKey: "noise.eventOther", fallbackLabel: "Other impulsive noise", color: "#90c9f9" },
  unknown: { labelKey: "noise.eventUnknown", fallbackLabel: "Unknown event", color: "#c8d4dc" }
};

const OCEAN_RENDER_MODE_OPTIONS = {
  currents: [
    { id: "speedParticles", label: "Speed + particles" },
    { id: "particlesOnly", label: "Particles only" },
    { id: "arrows", label: "Arrows" }
  ],
  waves: [
    { id: "heightStreaks", label: "Height + streaks" },
    { id: "streaksOnly", label: "Streaks only" },
    { id: "arrows", label: "Arrows" }
  ]
};


const state = {
  locale: "en",
  translations: {},
  oceanManifest: null,
  oceanConditions: {},
  oceanQueryIndices: {},
  oceanFrameData: {},
  metadata: null,
  map: null,
  mapReady: false,
  mapFailed: false,
  drawerOpen: false,
  selectionVersion: 0,
  frameStatus: "idle",
  frameQuality: null,
  paletteOverrides: {},
  pendingData: new Map(),
  maplibregl: null,
  popup: null,
  activeFrameIndex: 0,
  requestedTimeUtc: null,
  mode: "home",
  labelsVisible: true,
  activeConditionId: "temperature",
  satelliteWorking: false,
  selectedLocation: null,
  palette: "blueRed",
  controlCards: {
    collapsed: {},
    mobileExpandedId: null
  },
  oceanRenderModes: {
    currents: "speedParticles",
    waves: "heightStreaks"
  },
  overlayInfoId: null,
  oceanVisuals: {
    sourceIds: new Set(),
    requestToken: 0,
    renderCache: new Map()
  },
  selectedLocationRequestToken: 0,
  infrastructure: {
    active: false,
    loaded: false,
    manifest: null,
    categories: Object.fromEntries(INFRASTRUCTURE_CATEGORY_ORDER.map((id) => [id, true])),
    loadedCategories: {},
    interactiveLayerIds: []
  },
  noise: {
    active: false,
    categories: {
      continuousNoise: true,
      impulsiveEvents: true,
      impulsivePressure: false,
      ecologicalEffect: false
    },
    loaded: {}
  }
};

const TEMPERATURE_PALETTES = {
  oxygen: {
    labelKey: "accessibility.oxygen", fallbackLabel: msg("Oxygen · low to high"),
    stops: [{stop: 0, color: "#440154"}, {stop: 0.25, color: "#3b528b"}, {stop: 0.5, color: "#21918c"}, {stop: 0.75, color: "#5ec962"}, {stop: 1, color: "#fde725"}]
  },
  blueRed: {
    labelKey: "accessibility.blueRed",
    fallbackLabel: "Blue to red",
    stops: [
      { stop: 0, color: "#183b72" },
      { stop: 0.18, color: "#266f9e" },
      { stop: 0.42, color: "#42b1c0" },
      { stop: 0.6, color: "#8adfc4" },
      { stop: 0.8, color: "#ffda74" },
      { stop: 0.92, color: "#f07a45" },
      { stop: 1, color: "#cd4539" }
    ]
  },
  greenRed: {
    labelKey: "accessibility.greenRed",
    fallbackLabel: "Green to red",
    stops: [
      { stop: 0, color: "#104f2a" },
      { stop: 0.24, color: "#2f8f46" },
      { stop: 0.5, color: "#8acb5a" },
      { stop: 0.72, color: "#f1df72" },
      { stop: 0.88, color: "#f08b49" },
      { stop: 1, color: "#b32020" }
    ]
  },
  grayscale: {
    labelKey: "accessibility.grayscale",
    fallbackLabel: "Grayscale",
    stops: [
      { stop: 0, color: "#121212" },
      { stop: 0.2, color: "#3a3a3a" },
      { stop: 0.45, color: "#707070" },
      { stop: 0.7, color: "#b3b3b3" },
      { stop: 1, color: "#f4f4f4" }
    ]
  },
  yellowBlue: {
    labelKey: "accessibility.yellowBlue",
    fallbackLabel: "Yellow to blue",
    stops: [
      { stop: 0, color: "#ffe16a" },
      { stop: 0.2, color: "#f6c85f" },
      { stop: 0.42, color: "#9bd0e0" },
      { stop: 0.65, color: "#4f95d1" },
      { stop: 0.84, color: "#2459a6" },
      { stop: 1, color: "#102b6d" }
    ]
  }
};

const TRANSPARENT_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBg6nxsVgAAAAASUVORK5CYII=";

function msg(english, params = {}) {
  const text = state.translations.messages?.[english] ?? english ?? "";
  return String(text).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

function formatTimestamp(value) {
  return msg(formatUtcTimestamp(value, {en: "en-GB", de: "de-DE", da: "da-DK"}[state.locale]));
}

function intervalLabel(metadata) {
  return publishedIntervalLabel(metadata).replace("One published time step", msg("One published time step"))
    .replace("between published frames", msg("between published frames")).replace("(irregular)", msg("(irregular)"));
}

function layerLabel(id) {
  if (id === "oxygen") return msg(state.oceanConditions.oxygen?.condition?.depth_mode === "bottom" ? "Bottom dissolved oxygen" : "Surface dissolved oxygen");
  return t(`layers.${id === "noise" ? "underwaterNoise" : id}`, state.oceanConditions[id]?.condition?.label || id);
}

function flagSvg(locale) {
  const contents = locale === "de" ? '<path fill="#161616" d="M0 0h30v6H0z"/><path fill="#d00" d="M0 6h30v6H0z"/><path fill="#ffce00" d="M0 12h30v6H0z"/>'
    : locale === "da" ? '<path fill="#c8102e" d="M0 0h30v18H0z"/><path fill="#fff" d="M9 0h3v18H9zM0 7.5h30v3H0z"/>'
    : '<path fill="#003399" d="M0 0h30v18H0z"/>' + Array.from({length:12}, (_, i) => {
      const angle = i * Math.PI / 6;
      return `<path fill="#fc0" transform="translate(${15+5.7*Math.sin(angle)} ${9-5.7*Math.cos(angle)})" d="M0-1.1 .26-.35 1.05-.34 .42.14 .65.9 0 .45-.65.9-.42.14-1.05-.34-.26-.35Z"/>`;
    }).join("");
  return `<svg viewBox="0 0 30 18" width="30" height="18" aria-hidden="true" focusable="false">${contents}</svg>`;
}

// Guide markup accepts only two known glossary tokens, never arbitrary HTML or URLs.
function appendGuideText(root, text) {
  const links = {
    stratification: {en: "https://en.wikipedia.org/wiki/Stratification_(water)", de: "https://de.wikipedia.org/wiki/Temperaturschichtung", da: "https://da.wikipedia.org/wiki/Springlag"},
    waves: {en: "https://en.wikipedia.org/wiki/Significant_wave_height", de: "https://de.wikipedia.org/wiki/Wellenh%C3%B6he", da: "https://en.wikipedia.org/wiki/Significant_wave_height"}
  };
  let cursor = 0;
  for (const match of text.matchAll(/\[([^\]]+)\]\((stratification|waves)\)/g)) {
    root.append(document.createTextNode(text.slice(cursor, match.index)));
    const link = document.createElement("a");
    link.href = links[match[2]][state.locale];
    link.textContent = match[1];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = state.locale === "da" && match[2] === "waves" ? "Wikipedia (engelsk)" : "Wikipedia";
    root.append(link);
    cursor = match.index + match[0].length;
  }
  root.append(document.createTextNode(text.slice(cursor)));
}

function getTranslationValue(path, params = {}) {
  const value = path.split(".").reduce((current, key) => current?.[key], state.translations);
  if (typeof value !== "string") {
    return null;
  }
  return value.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

function t(path, fallback, params = {}) {
  return getTranslationValue(path, params) ?? fallback;
}

let localeRequest = 0;
async function loadTranslations(locale) {
  const request = ++localeRequest;
  const response = await fetch(`./locales/${locale}.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Locale ${locale} could not be loaded.`);
  }
  const translations = await response.json();
  if (request !== localeRequest) return;
  state.translations = translations;
  state.locale = locale;
}

function renderLanguageMenu() {
  languageMenuEl.innerHTML = "";
  for (const language of SUPPORTED_LANGUAGES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "language-option";
    button.disabled = !language.enabled;
    if (language.code === state.locale) {
      button.classList.add("is-active");
    }

    const label = document.createElement("span");
    label.textContent = language.label;
    label.className = "language-name";
    if (language.enabled) {
      const flag = document.createElement("span");
      flag.className = "language-flag";
      flag.innerHTML = flagSvg(language.code);
      label.prepend(flag);
    }
    button.dataset.language = language.code;
    button.setAttribute("aria-pressed", String(language.code === state.locale));
    const meta = document.createElement("span");
    meta.className = "language-meta";
    meta.textContent = language.enabled ? t("common.live", msg("Available")) : t("common.comingSoon", "Coming soon");
    button.append(label, meta);

    button.addEventListener("click", async () => {
      if (!language.enabled || language.code === state.locale) {
        closeLanguageMenu();
        return;
      }
      try {
        await loadTranslations(language.code);
        applyTranslations();
        closeLanguageMenu();
        languageButtonEl.focus();
      } catch (error) {
        console.error(error);
        setStatus(msg("Language could not be loaded. Please try again."), "warning");
      }
    });

    languageMenuEl.appendChild(button);
  }
}

function applyTranslations() {
  document.documentElement.lang = state.locale;
  document.title = msg("Digital Baltic Sea — Explore the Baltic");
  localizeMapControls();
  for (const node of document.querySelectorAll(".roadmap-list li")) node.dataset.availability = t(node.classList.contains("is-live") ? "common.live" : "common.comingSoon", "");
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.dataset.i18n;
    const translated = getTranslationValue(key);
    if (translated) {
      node.textContent = translated;
    }
  }
  languageCurrentEl.textContent = t("nav.languageCode", "EN");
  languageButtonEl.querySelector(".language-flag").innerHTML = flagSvg(state.locale);
  for (const node of document.querySelectorAll("[data-message]")) node.textContent = msg(node.dataset.message);
  for (const attr of ["aria-label", "alt"]) {
    for (const node of document.querySelectorAll(`[data-message-${attr}]`)) node.setAttribute(attr, msg(node.getAttribute(`data-message-${attr}`)));
  }
  for (const button of overlayInfoButtonEls) button.setAttribute("aria-label", msg("About {layer}", {layer:layerLabel(button.dataset.overlayInfoButton)}));
  renderLanguageMenu();
  updateViewToggle();
  updateLayerToggleUi();
  updateStaticPanels();
  updatePaletteButtons();
  renderOverlayInfoPanel();
  updateTransparencyPanel();
  updateDataSummary();
  syncPanelAccess();
  updateStatusForVisibleLayers();
  if (state.mapFailed) renderMapFailureText();
  else if (state.mapReady && !state.satelliteWorking) setStatus(t("status.fallbackMap", ""), "warning");
  if (state.selectedLocation && state.mapReady) updateSelectedLocationValues();
  if (state.metadata) {
    updateChrome();
  }
}

function openLanguageMenu() {
  languageMenuEl.hidden = false;
  languageButtonEl.setAttribute("aria-expanded", "true");
}

function closeLanguageMenu() {
  languageMenuEl.hidden = true;
  languageButtonEl.setAttribute("aria-expanded", "false");
}

function openPaletteMenu() {
  paletteMenuEl.hidden = false;
  paletteButtonEl.setAttribute("aria-expanded", "true");
}

function closePaletteMenu() {
  paletteMenuEl.hidden = true;
  paletteButtonEl.setAttribute("aria-expanded", "false");
}

function bindLanguageMenu() {
  languageButtonEl.addEventListener("click", () => {
    if (languageMenuEl.hidden) {
      openLanguageMenu();
    } else {
      closeLanguageMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!languageMenuEl.hidden && !event.target.closest(".language-picker")) {
      closeLanguageMenu();
    }
    if (!paletteMenuEl.hidden && !event.target.closest(".palette-picker")) {
      closePaletteMenu();
    }
  });
}

function bindPaletteMenu() {
  paletteButtonEl.addEventListener("click", () => {
    if (paletteMenuEl.hidden) {
      openPaletteMenu();
    } else {
      closePaletteMenu();
    }
  });
}

function setMode(mode) {
  state.mode = mode;
  bodyEl.dataset.mode = mode;
  state.drawerOpen = false;
  if (mode !== "map") {
    clickPanelEl.hidden = true;
    state.overlayInfoId = null;
  }
  renderOverlayInfoPanel();
  syncPanelAccess();
  (mode === "map" ? document.getElementById("exit-map") : heroEnterMapEl).focus();
  state.map?.resize();
  syncFlowAnimation();
}

function setStatus(message, tone = "neutral") {
  statusMessageEl.textContent = message;
  statusPanelEl.dataset.tone = tone;
  statusPanelEl.hidden = false;
}

function clearStatus() {
  statusPanelEl.hidden = true;
}



function formatCoordinate(value, positiveLabel, negativeLabel) {
  const label = value >= 0 ? positiveLabel : negativeLabel;
  return `${Math.abs(value).toFixed(4)} ${label}`;
}

function activeConditionDefinition() {
  const condition = state.oceanConditions[state.activeConditionId]?.condition;
  return condition ? {...condition, label: layerLabel(state.activeConditionId), value_label: layerLabel(state.activeConditionId)} : null;
}

function activeConditionMetadata() {
  return state.oceanConditions[state.activeConditionId]?.metadata ?? null;
}

function oceanLayerVisible() {
  return Boolean(state.activeConditionId && activeConditionHasLocalData());
}

function currentFrame() {
  return activeConditionMetadata()?.frames?.[state.activeFrameIndex] ?? null;
}

function visibleViewportBbox() {
  const bounds = state.map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function imageCoordinatesFromBbox(bbox) {
  return [
    [bbox[0][0], bbox[1][1]],
    [bbox[1][0], bbox[1][1]],
    [bbox[1][0], bbox[0][1]],
    [bbox[0][0], bbox[0][1]]
  ];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, ratio) {
  return start + (end - start) * ratio;
}

function oceanPaletteName(conditionId = state.activeConditionId) {
  return state.paletteOverrides[conditionId] || (conditionId === "oxygen" ? "oxygen" : state.palette);
}

function renderModeOptions(conditionId = state.activeConditionId) {
  return OCEAN_RENDER_MODE_OPTIONS[conditionId] ?? [];
}

function activeRenderModeId(conditionId = state.activeConditionId) {
  const options = renderModeOptions(conditionId);
  if (options.length === 0) {
    return null;
  }
  return state.oceanRenderModes[conditionId] ?? options[0].id;
}

function oceanScalarLayerVisible() {
  if (!oceanLayerVisible()) {
    return false;
  }
  if (state.activeConditionId === "currents") {
    return ["speedParticles", "arrows"].includes(activeRenderModeId());
  }
  if (state.activeConditionId === "waves") {
    return ["heightStreaks", "arrows"].includes(activeRenderModeId());
  }
  return true;
}

function oceanVectorLayerVisible() {
  return oceanLayerVisible() && (state.activeConditionId === "currents" || state.activeConditionId === "waves");
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

function buildCellEdges(values) {
  const numeric = values.map((value) => Number(value));
  if (numeric.length === 1) {
    return [numeric[0] - 0.05, numeric[0] + 0.05];
  }
  const edges = new Array(numeric.length + 1);
  edges[0] = numeric[0] - (numeric[1] - numeric[0]) / 2;
  for (let index = 1; index < numeric.length; index += 1) {
    edges[index] = (numeric[index - 1] + numeric[index]) / 2;
  }
  edges[numeric.length] = numeric[numeric.length - 1] + (numeric[numeric.length - 1] - numeric[numeric.length - 2]) / 2;
  return edges;
}

function queryIndexGeometryCache(queryIndex) {
  if (!queryIndex) {
    return null;
  }
  if (queryIndex.__geometryCache) {
    return queryIndex.__geometryCache;
  }
  const latitudes = queryIndex.latitudes ?? [];
  const longitudes = queryIndex.longitudes ?? [];
  queryIndex.__geometryCache = {
    latEdges: buildCellEdges(latitudes),
    lonEdges: buildCellEdges(longitudes)
  };
  return queryIndex.__geometryCache;
}

function frameRenderCacheKey(conditionId, frameKey, paletteName, rowStart, rowEndExclusive, colStart, colEndExclusive, step, subdivision, stride) {
  return [
    conditionId,
    frameKey,
    paletteName,
    rowStart,
    rowEndExclusive,
    colStart,
    colEndExclusive,
    step,
    subdivision,
    stride
  ].join("|");
}

function findIntervalIndex(edges, target) {
  if (!Array.isArray(edges) || edges.length < 2) {
    return 0;
  }
  if (target <= edges[0]) {
    return 0;
  }
  if (target >= edges[edges.length - 1]) {
    return edges.length - 2;
  }
  let low = 0;
  let high = edges.length - 2;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (target < edges[middle]) {
      high = middle - 1;
    } else if (target >= edges[middle + 1]) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return clamp(low, 0, edges.length - 2);
}

function numericGridValue(grid, rowIndex, columnIndex) {
  const rawValue = grid?.[rowIndex]?.[columnIndex];
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function componentFrame(frameData, componentName) {
  return frameData?.components?.[componentName] ?? null;
}

function rgbaString(color, alpha = 1) {
  const opacity = clamp(alpha, 0, 1);
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity.toFixed(3)})`;
}



function valueToFillColor(value, metadata, conditionId = state.activeConditionId) {
  const range = displayRangeForMetadata(metadata);
  const span = Math.max(range.max - range.min, 1e-6);
  const normalized = clamp((value - range.min) / span, 0, 1);
  return rgbaString(interpolatePaletteColor(normalized, TEMPERATURE_PALETTES[oceanPaletteName(conditionId)]), 0.82);
}

function expandedViewportBbox() {
  const [west, south, east, north] = visibleViewportBbox();
  const lonPadding = Math.max((east - west) * 0.08, 0.15);
  const latPadding = Math.max((north - south) * 0.08, 0.12);
  return [west - lonPadding, south - latPadding, east + lonPadding, north + latPadding];
}

function scalarResolutionForZoom(zoom) {
  if (zoom < 5) {
    return { step: 4, subdivision: 1 };
  }
  if (zoom < 7) {
    return { step: 3, subdivision: 1 };
  }
  if (zoom < 8.5) {
    return { step: 2, subdivision: 1 };
  }
  if (zoom < 10.5) {
    return { step: 1, subdivision: 1 };
  }
  if (zoom < 12.5) {
    return { step: 1, subdivision: 2 };
  }
  return { step: 1, subdivision: 3 };
}

function vectorStrideForZoom(zoom) {
  if (zoom < 5) {
    return 8;
  }
  if (zoom < 7) {
    return 6;
  }
  if (zoom < 9) {
    return 4;
  }
  if (zoom < 11) {
    return 3;
  }
  return 2;
}

function interpolateStructuredValue(latitude, longitude, latitudes, longitudes, grid, latEdges = null, lonEdges = null) {
  if (!Array.isArray(latitudes) || !Array.isArray(longitudes) || latitudes.length === 0 || longitudes.length === 0) {
    return null;
  }
  const resolvedLatEdges = latEdges ?? buildCellEdges(latitudes);
  const resolvedLonEdges = lonEdges ?? buildCellEdges(longitudes);
  const row1 = clamp(findIntervalIndex(resolvedLatEdges, latitude) + 1, 0, latitudes.length - 1);
  const row0 = clamp(row1 > 0 ? row1 - 1 : row1, 0, latitudes.length - 1);
  const col1 = clamp(findIntervalIndex(resolvedLonEdges, longitude) + 1, 0, longitudes.length - 1);
  const col0 = clamp(col1 > 0 ? col1 - 1 : col1, 0, longitudes.length - 1);

  const rows = [...new Set([row0, row1])];
  const cols = [...new Set([col0, col1])];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const rowIndex of rows) {
    for (const columnIndex of cols) {
      const value = numericGridValue(grid, rowIndex, columnIndex);
      if (value === null) {
        continue;
      }
      const sampleLat = Number(latitudes[rowIndex]);
      const sampleLon = Number(longitudes[columnIndex]);
      const cosLatitude = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
      const distanceSquared = (sampleLat - latitude) ** 2 + ((sampleLon - longitude) * cosLatitude) ** 2;
      if (distanceSquared < 1e-10) {
        return value;
      }
      const weight = 1 / distanceSquared;
      weightedSum += value * weight;
      weightTotal += weight;
    }
  }

  return weightTotal > 0 ? weightedSum / weightTotal : null;
}

function interpolateVectorAt(latitude, longitude, latitudes, longitudes, eastwardGrid, northwardGrid, latEdges = null, lonEdges = null) {
  const eastward = interpolateStructuredValue(latitude, longitude, latitudes, longitudes, eastwardGrid, latEdges, lonEdges);
  const northward = interpolateStructuredValue(latitude, longitude, latitudes, longitudes, northwardGrid, latEdges, lonEdges);
  if (eastward === null || northward === null) {
    return null;
  }
  return { eastward, northward };
}

function ensureOceanSources() {
  if (!state.map || state.map.getSource("ocean-scalar-source")) {
    return;
  }

  const beforeLayerId = state.map.getLayer("selected-location-ring") ? "selected-location-ring" : undefined;
  state.map.addSource("ocean-scalar-source", { type: "geojson", data: emptyFeatureCollection() });
  state.map.addSource("ocean-shoreline-source", { type: "geojson", data: emptyFeatureCollection() });
  state.map.addSource("ocean-vector-source", { type: "geojson", data: emptyFeatureCollection() });

  state.map.addLayer(
    {
      id: "ocean-scalar-fill",
      type: "fill",
      source: "ocean-scalar-source",
      paint: {
        "fill-color": ["coalesce", ["get", "fillColor"], "rgba(0,0,0,0)"],
        "fill-opacity": 0,
        "fill-antialias": true
      }
    },
    beforeLayerId
  );
  state.map.addLayer(
    {
      id: "ocean-shoreline",
      type: "line",
      source: "ocean-shoreline-source",
      paint: {
        "line-color": "#f1ead2",
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 10, 1.2, 14, 1.7],
        "line-opacity": 0
      },
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    },
    beforeLayerId
  );
  state.map.addLayer({id: "ocean-vector-halo", type: "line", source: "ocean-vector-source",
    paint: {"line-color": "#102d3e", "line-width": 6, "line-opacity": 0},
    layout: {"line-join": "round", "line-cap": "round"}}, beforeLayerId);
  state.map.addLayer(
    {
      id: "ocean-vector-shaft",
      type: "line",
      source: "ocean-vector-source",
      filter: ["==", ["get", "kind"], "shaft"],
      paint: {
        "line-color": ["coalesce", ["get", "strokeColor"], "#eaf7ff"],
        "line-width": ["coalesce", ["get", "strokeWidth"], 1.4],
        "line-opacity": 0,
        "line-dasharray": [1, 0]
      },
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    },
    beforeLayerId
  );
  state.map.addLayer(
    {
      id: "ocean-vector-head",
      type: "line",
      source: "ocean-vector-source",
      filter: ["==", ["get", "kind"], "head"],
      paint: {
        "line-color": ["coalesce", ["get", "strokeColor"], "#f5fbff"],
        "line-width": ["coalesce", ["get", "strokeWidth"], 1.4],
        "line-opacity": 0
      },
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    },
    beforeLayerId
  );
}

function updateOceanLayerStyles() {
  if (!state.map?.getLayer("ocean-scalar-fill")) {
    return;
  }

  const ready = state.renderedSelectionVersion === state.selectionVersion;
  for (const id of ["ocean-scalar-fill", "ocean-shoreline", "ocean-vector-shaft", "ocean-vector-head", "ocean-vector-halo"]) {
    state.map.setLayoutProperty(id, "visibility", ready && oceanLayerVisible() ? "visible" : "none");
  }
  const mode = activeRenderModeId();
  const scalarOpacity = oceanScalarLayerVisible() ? 0.78 : 0;
  const shorelineOpacity = oceanLayerVisible() ? 0.72 : 0;
  let shaftOpacity = 0;
  let headOpacity = 0;
  let dashArray = [1, 0];

  if (oceanVectorLayerVisible()) {
    if (mode === "arrows") {
      shaftOpacity = 0.88;
      headOpacity = 0.88;
    }
  }
  state.map.setPaintProperty("ocean-vector-halo", "line-opacity", mode === "arrows" ? 0.9 : 0);

  state.map.setPaintProperty("ocean-scalar-fill", "fill-opacity", scalarOpacity);
  state.map.setPaintProperty("ocean-shoreline", "line-opacity", shorelineOpacity);
  state.map.setPaintProperty("ocean-vector-shaft", "line-opacity", shaftOpacity);
  state.map.setPaintProperty("ocean-vector-shaft", "line-dasharray", dashArray);
  state.map.setPaintProperty("ocean-vector-head", "line-opacity", headOpacity);
  syncFlowAnimation();
}

function buildOceanRenderCollections(queryIndex, frameData, metadata, condition, frameIndex, zoom) {
  const latitudes = queryIndex?.latitudes ?? [];
  const longitudes = queryIndex?.longitudes ?? [];
  const gridKey = metadata.query_value_key || condition.value_key || "values_celsius";
  const frameGrid = frameData?.[gridKey] ?? queryIndex?.[gridKey]?.[frameIndex] ?? null;
  if (!Array.isArray(frameGrid) || latitudes.length === 0 || longitudes.length === 0) {
    return {
      scalar: emptyFeatureCollection(),
      shoreline: emptyFeatureCollection(),
      vector: emptyFeatureCollection()
    };
  }

  const geometryCache = queryIndexGeometryCache(queryIndex);
  const latEdges = geometryCache?.latEdges ?? buildCellEdges(latitudes);
  const lonEdges = geometryCache?.lonEdges ?? buildCellEdges(longitudes);
  const [west, south, east, north] = expandedViewportBbox();
  const rowStart = clamp(findIntervalIndex(latEdges, south), 0, latitudes.length - 1);
  const rowEndExclusive = clamp(findIntervalIndex(latEdges, north) + 1, 1, latitudes.length);
  const colStart = clamp(findIntervalIndex(lonEdges, west), 0, longitudes.length - 1);
  const colEndExclusive = clamp(findIntervalIndex(lonEdges, east) + 1, 1, longitudes.length);
  const paletteConditionId = condition.id;

  let { step, subdivision } = scalarResolutionForZoom(zoom);
  let scalarEstimate =
    Math.max(Math.ceil((rowEndExclusive - rowStart) / step), 1) *
    Math.max(Math.ceil((colEndExclusive - colStart) / step), 1) *
    subdivision *
    subdivision;
  while (scalarEstimate > 4200) {
    if (subdivision > 1) {
      subdivision -= 1;
    } else {
      step += 1;
    }
    scalarEstimate =
      Math.max(Math.ceil((rowEndExclusive - rowStart) / step), 1) *
      Math.max(Math.ceil((colEndExclusive - colStart) / step), 1) *
      subdivision *
      subdivision;
  }

  let stride = vectorStrideForZoom(zoom);
  let vectorEstimate =
    Math.max(Math.ceil((rowEndExclusive - rowStart) / stride), 1) *
    Math.max(Math.ceil((colEndExclusive - colStart) / stride), 1);
  while (vectorEstimate > 900) {
    stride += 1;
    vectorEstimate =
      Math.max(Math.ceil((rowEndExclusive - rowStart) / stride), 1) *
      Math.max(Math.ceil((colEndExclusive - colStart) / stride), 1);
  }

  const cacheKey = frameRenderCacheKey(
    condition.id,
    frameData?.key ?? queryIndex?.frame_keys?.[frameIndex] ?? String(frameIndex),
    oceanPaletteName(condition.id),
    rowStart,
    rowEndExclusive,
    colStart,
    colEndExclusive,
    step,
    subdivision,
    stride
  ) + JSON.stringify([zoom, state.map.getBearing(), state.map.getPitch(), west, south, east, north, mapContainerEl.clientWidth, mapContainerEl.clientHeight]);
  const cachedCollections = state.oceanVisuals.renderCache.get(cacheKey);
  if (cachedCollections) {
    return cachedCollections;
  }

  const scalarFeatures = [];
  const shorelineFeatures = [];
  const vectorFeatures = [];

  for (let rowIndex = rowStart; rowIndex < rowEndExclusive; rowIndex += step) {
    const rowStop = Math.min(rowIndex + step, rowEndExclusive);
    for (let columnIndex = colStart; columnIndex < colEndExclusive; columnIndex += step) {
      const columnStop = Math.min(columnIndex + step, colEndExclusive);

      if (step > 1) {
        let total = 0;
        let count = 0;
        const totalCells = (rowStop - rowIndex) * (columnStop - columnIndex);
        for (let coarseRow = rowIndex; coarseRow < rowStop; coarseRow += 1) {
          for (let coarseColumn = columnIndex; coarseColumn < columnStop; coarseColumn += 1) {
            const value = numericGridValue(frameGrid, coarseRow, coarseColumn);
            if (value === null) {
              continue;
            }
            total += value;
            count += 1;
          }
        }
        if (count === 0) {
          continue;
        }
        if (count < totalCells) {
          for (let coarseRow = rowIndex; coarseRow < rowStop; coarseRow += 1) {
            for (let coarseColumn = columnIndex; coarseColumn < columnStop; coarseColumn += 1) {
              const value = numericGridValue(frameGrid, coarseRow, coarseColumn);
              if (value === null) {
                continue;
              }
              scalarFeatures.push({
                type: "Feature",
                properties: {
                  fillColor: valueToFillColor(value, metadata, paletteConditionId)
                },
                geometry: {
                  type: "Polygon",
                  coordinates: [[
                    [lonEdges[coarseColumn], latEdges[coarseRow]],
                    [lonEdges[coarseColumn + 1], latEdges[coarseRow]],
                    [lonEdges[coarseColumn + 1], latEdges[coarseRow + 1]],
                    [lonEdges[coarseColumn], latEdges[coarseRow + 1]],
                    [lonEdges[coarseColumn], latEdges[coarseRow]]
                  ]]
                }
              });
            }
          }
          continue;
        }

        scalarFeatures.push({
          type: "Feature",
          properties: {
            fillColor: valueToFillColor(total / count, metadata, paletteConditionId)
          },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [lonEdges[columnIndex], latEdges[rowIndex]],
              [lonEdges[columnStop], latEdges[rowIndex]],
              [lonEdges[columnStop], latEdges[rowStop]],
              [lonEdges[columnIndex], latEdges[rowStop]],
              [lonEdges[columnIndex], latEdges[rowIndex]]
            ]]
          }
        });
        continue;
      }

      if (numericGridValue(frameGrid, rowIndex, columnIndex) === null) {
        continue;
      }

      const southEdge = latEdges[rowIndex];
      const northEdge = latEdges[rowIndex + 1];
      const westEdge = lonEdges[columnIndex];
      const eastEdge = lonEdges[columnIndex + 1];
      for (let subRow = 0; subRow < subdivision; subRow += 1) {
        const subSouth = lerp(southEdge, northEdge, subRow / subdivision);
        const subNorth = lerp(southEdge, northEdge, (subRow + 1) / subdivision);
        for (let subColumn = 0; subColumn < subdivision; subColumn += 1) {
          const subWest = lerp(westEdge, eastEdge, subColumn / subdivision);
          const subEast = lerp(westEdge, eastEdge, (subColumn + 1) / subdivision);
          const centerLatitude = (subSouth + subNorth) / 2;
          const centerLongitude = (subWest + subEast) / 2;
          const value = interpolateStructuredValue(centerLatitude, centerLongitude, latitudes, longitudes, frameGrid, latEdges, lonEdges);
          if (value === null) {
            continue;
          }
          scalarFeatures.push({
            type: "Feature",
            properties: {
              fillColor: valueToFillColor(value, metadata, paletteConditionId)
            },
            geometry: {
              type: "Polygon",
              coordinates: [[
                [subWest, subSouth],
                [subEast, subSouth],
                [subEast, subNorth],
                [subWest, subNorth],
                [subWest, subSouth]
              ]]
            }
          });
        }
      }
    }
  }

  for (let rowIndex = rowStart; rowIndex < rowEndExclusive; rowIndex += 1) {
    for (let columnIndex = colStart; columnIndex < colEndExclusive; columnIndex += 1) {
      if (numericGridValue(frameGrid, rowIndex, columnIndex) === null) {
        continue;
      }
      const southEdge = latEdges[rowIndex];
      const northEdge = latEdges[rowIndex + 1];
      const westEdge = lonEdges[columnIndex];
      const eastEdge = lonEdges[columnIndex + 1];

      if (rowIndex === 0 || numericGridValue(frameGrid, rowIndex - 1, columnIndex) === null) {
        shorelineFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[westEdge, southEdge], [eastEdge, southEdge]] }
        });
      }
      if (rowIndex === latitudes.length - 1 || numericGridValue(frameGrid, rowIndex + 1, columnIndex) === null) {
        shorelineFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[westEdge, northEdge], [eastEdge, northEdge]] }
        });
      }
      if (columnIndex === 0 || numericGridValue(frameGrid, rowIndex, columnIndex - 1) === null) {
        shorelineFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[westEdge, southEdge], [westEdge, northEdge]] }
        });
      }
      if (columnIndex === longitudes.length - 1 || numericGridValue(frameGrid, rowIndex, columnIndex + 1) === null) {
        shorelineFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[eastEdge, southEdge], [eastEdge, northEdge]] }
        });
      }
    }
  }

  const eastwardGrid =
    condition.id === "currents"
      ? componentFrame(frameData, "eastward_mps")
      : componentFrame(frameData, "eastward_unit");
  const northwardGrid =
    condition.id === "currents"
      ? componentFrame(frameData, "northward_mps")
      : componentFrame(frameData, "northward_unit");

  if (Array.isArray(eastwardGrid) && Array.isArray(northwardGrid)) {
    const range = displayRangeForMetadata(metadata);
    const span = Math.max(range.max - range.min, 1e-6);
    const width = mapContainerEl.clientWidth, height = mapContainerEl.clientHeight;
    const spacing = Math.max(64, Math.sqrt(width * height / 650));
    for (let y = 32; y < height; y += spacing) {
      for (let x = 32; x < width; x += spacing) {
        const center = state.map.unproject([x, y]);
        const centerLatitude = center.lat, centerLongitude = center.lng;
        if (centerLatitude < latEdges[0] || centerLatitude > latEdges.at(-1) || centerLongitude < lonEdges[0] || centerLongitude > lonEdges.at(-1)) continue;
        const rowIndex = findIntervalIndex(latEdges, centerLatitude), columnIndex = findIntervalIndex(lonEdges, centerLongitude);
        if (numericGridValue(frameGrid, rowIndex, columnIndex) === null) continue;
        const vector = interpolateVectorAt(centerLatitude, centerLongitude, latitudes, longitudes, eastwardGrid, northwardGrid, latEdges, lonEdges);
        if (!vector) {
          continue;
        }
        const magnitude = condition.id === "currents" ? Math.hypot(vector.eastward, vector.northward) : numericGridValue(frameGrid, rowIndex, columnIndex);
        if (!Number.isFinite(magnitude) || magnitude <= 0.0001) {
          continue;
        }

        const directionScale = clamp((magnitude - range.min) / span, 0.15, 1);
        const lengthPixels = 34 + 14 * directionScale;
        const vectorMagnitude = Math.hypot(vector.eastward, vector.northward);
        if (!Number.isFinite(vectorMagnitude) || vectorMagnitude <= 1e-6) {
          continue;
        }
        const eastwardUnit = vector.eastward / vectorMagnitude;
        const northwardUnit = vector.northward / vectorMagnitude;
        const cosLatitude = Math.max(Math.cos((centerLatitude * Math.PI) / 180), 0.2);
        const projected = state.map.project([centerLongitude + eastwardUnit * 0.001 / cosLatitude, centerLatitude + northwardUnit * 0.001]);
        const norm = Math.hypot(projected.x - x, projected.y - y);
        if (norm < 1e-8) continue;
        const dx = (projected.x - x) / norm, dy = (projected.y - y) / norm;
        const startPixel = [x - dx * lengthPixels / 2, y - dy * lengthPixels / 2];
        const endPixel = [x + dx * lengthPixels / 2, y + dy * lengthPixels / 2];
        const start = state.map.unproject(startPixel).toArray(), end = state.map.unproject(endPixel).toArray();
        const strokeColor = "#f4fcff";
        const strokeWidth = 3;
        vectorFeatures.push({
          type: "Feature",
          properties: {
            kind: "shaft",
            strokeColor,
            strokeWidth
          },
          geometry: {
            type: "LineString",
            coordinates: [start, end]
          }
        });

        const headLength = 12, headWidth = 7;
        const leftPoint = state.map.unproject([endPixel[0] - dx * headLength - dy * headWidth, endPixel[1] - dy * headLength + dx * headWidth]).toArray();
        const rightPoint = state.map.unproject([endPixel[0] - dx * headLength + dy * headWidth, endPixel[1] - dy * headLength - dx * headWidth]).toArray();
        vectorFeatures.push({
          type: "Feature",
          properties: {
            kind: "head",
            strokeColor,
            strokeWidth
          },
          geometry: {
            type: "LineString",
            coordinates: [leftPoint, end, rightPoint]
          }
        });
      }
    }
  }

  const collections = {
    scalar: { type: "FeatureCollection", features: scalarFeatures },
    shoreline: { type: "FeatureCollection", features: shorelineFeatures },
    vector: { type: "FeatureCollection", features: vectorFeatures }
  };
  state.oceanVisuals.renderCache.set(cacheKey, collections);
  if (state.oceanVisuals.renderCache.size > 6) {
    const oldestKey = state.oceanVisuals.renderCache.keys().next().value;
    if (oldestKey) {
      state.oceanVisuals.renderCache.delete(oldestKey);
    }
  }
  return collections;
}

function setGeoJsonSourceData(sourceId, payload) {
  const source = state.map?.getSource(sourceId);
  if (source && typeof source.setData === "function") {
    source.setData(payload);
  }
}

async function refreshOceanVisuals(selection = selectionSnapshot()) {
  const token = ++state.oceanVisuals.requestToken;
  if (!state.mapReady || !state.map) return;
  ensureOceanSources();
  updateOceanLayerStyles();
  if (!oceanLayerVisible()) { clearOceanVisuals(); return; }
  try {
    const queryIndex = await loadActiveQueryIndex(selection);
    if (!selectionIsCurrent(selection) || token !== state.oceanVisuals.requestToken) return;
    const frameData = await loadActiveFrameData(queryIndex, selection);
    if (!selectionIsCurrent(selection) || token !== state.oceanVisuals.requestToken || !frameData) return;
    const collections = buildOceanRenderCollections(queryIndex, frameData, selection.metadata, selection.condition, selection.frameIndex, state.map.getZoom());
    if (!selectionIsCurrent(selection) || token !== state.oceanVisuals.requestToken) return;
    setGeoJsonSourceData("ocean-scalar-source", collections.scalar);
    setGeoJsonSourceData("ocean-shoreline-source", collections.shoreline);
    setGeoJsonSourceData("ocean-vector-source", collections.vector);
    // GeoJSON is processed in a worker; old geometry stays hidden until the new sources finish.
    if (!await waitForOceanSources(state.map, selection, token)) return;
    state.flowFeatures = collections.vector.features.filter(feature => feature.properties.kind === "shaft");
    state.renderedSelectionVersion = selection.version;
    state.frameStatus = "ready";
    state.frameQuality = frameData.quality;
    mapContainerEl.dataset.frame = selection.frame.time_utc;
    mapContainerEl.dataset.condition = selection.conditionId;
    updateOceanLayerStyles();
    updateChrome();
    updateTransparencyPanel();
  } catch (error) {
    if (!selectionIsCurrent(selection) || token !== state.oceanVisuals.requestToken) return;
    console.error(error);
    clearOceanVisuals();
    state.frameStatus = "error";
    updateChrome();
  }
}

function nearestIndex(values, target) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Index is empty.");
  }

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  values.forEach((value, index) => {
    const distance = Math.abs(Number(value) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

async function loadActiveQueryIndex(selection = selectionSnapshot()) {
  const {conditionId, metadata} = selection;
  if (!conditionId || !metadata?.query_index_url) return null;
  if (state.oceanQueryIndices[conditionId]) return state.oceanQueryIndices[conditionId];
  const payload = await readStaticJson(metadata.query_index_url);
  if (!Array.isArray(payload.latitudes) || !payload.latitudes.length || !Array.isArray(payload.longitudes) || !payload.longitudes.length) throw new Error("Empty ocean grid");
  state.oceanQueryIndices[conditionId] = payload;
  return payload;
}

function activeFrameEntry(queryIndex, selection = selectionSnapshot()) {
  return queryIndex?.frames?.find(frame => frame.key === selection.frame?.key || frame.time_utc === selection.frame?.time_utc) ?? null;
}

async function loadActiveFrameData(queryIndex = null, selection = selectionSnapshot()) {
  const {conditionId, metadata, condition, frame} = selection;
  const index = queryIndex || await loadActiveQueryIndex(selection);
  if (!conditionId || !metadata || !index || !frame) return null;
  const frameEntry = activeFrameEntry(index, selection);
  const gridKey = metadata.query_value_key || condition?.value_key || "values_celsius";
  const cache = state.oceanFrameData[conditionId] ||= {};
  if (cache[frame.key]) return cache[frame.key];
  let payload;
  if (frameEntry?.data_url) {
    payload = await readStaticJson(frameEntry.data_url);
  } else {
    const indexAtTime = index.times_utc?.indexOf(frame.time_utc) ?? -1;
    payload = {key: frame.key, time_utc: frame.time_utc, [gridKey]: index[gridKey]?.[indexAtTime], components: Object.fromEntries(Object.entries(index.components || {}).map(([key, values]) => [key, values[indexAtTime]]))};
  }
  if (payload.time_utc !== frame.time_utc || (payload.key && payload.key !== frame.key)) throw new Error("Frame timestamp does not match the selection");
  const cleaned = cleanFrame(payload, gridKey, condition);
  if (cleaned.quality.invalidCount) console.warn("Excluded invalid primary values", conditionId, frame.key, cleaned.quality.invalidCount);
  cache[frame.key] = cleaned;
  // Bound memory without changing or regenerating any data.
  while (Object.keys(cache).length > 4) delete cache[Object.keys(cache)[0]];
  return cleaned;
}

async function fetchOceanSample(latitude, longitude, selection = selectionSnapshot()) {
  const {metadata, condition} = selection;
  const queryIndex = await loadActiveQueryIndex(selection);
  const frameData = await loadActiveFrameData(queryIndex, selection);
  if (!metadata || !condition || !queryIndex || !frameData) {
    return {
      condition_id: selection.conditionId,
      frame_index: selection.frameIndex,
      time_utc: selection.frame?.time_utc ?? null,
      cell_latitude: null,
      cell_longitude: null,
      primary_value: null,
      primary_unit: condition?.units || "",
      note: "Processed query index is not available."
    };
  }

  const bbox = metadata.region?.bbox;
  if (
    !bbox ||
    latitude < bbox.minimum_latitude ||
    latitude > bbox.maximum_latitude ||
    longitude < bbox.minimum_longitude ||
    longitude > bbox.maximum_longitude
  ) {
    return {
      condition_id: selection.conditionId,
      frame_index: selection.frameIndex,
      time_utc: selection.frame?.time_utc ?? null,
      cell_latitude: null,
      cell_longitude: null,
      primary_value: null,
      primary_unit: readableUnit(condition.units),
      note: "Outside Baltic processing bounds"
    };
  }

  const latitudes = queryIndex.latitudes || [];
  const longitudes = queryIndex.longitudes || [];
  const frameIndex = queryIndex.times_utc.indexOf(selection.frame.time_utc);
  const gridKey = metadata.query_value_key || condition.value_key || "values_celsius";
  const frameGrid = frameData?.[gridKey] ?? queryIndex?.[gridKey]?.[frameIndex] ?? null;
  const geometryCache = queryIndexGeometryCache(queryIndex);
  const latEdges = geometryCache?.latEdges ?? buildCellEdges(latitudes);
  const lonEdges = geometryCache?.lonEdges ?? buildCellEdges(longitudes);
  const rowIndex = clamp(findIntervalIndex(latEdges, latitude), 0, Math.max(latitudes.length - 1, 0));
  const columnIndex = clamp(findIntervalIndex(lonEdges, longitude), 0, Math.max(longitudes.length - 1, 0));
  const cellValue = frameGrid ? numericGridValue(frameGrid, rowIndex, columnIndex) : null;
  const primaryValue = condition.depth_mode === "bottom" ? cellValue :
    frameGrid && cellValue !== null ? interpolateStructuredValue(latitude, longitude, latitudes, longitudes, frameGrid, latEdges, lonEdges) : null;

  const payload = {
    condition_id: selection.conditionId,
    frame_index: frameIndex,
    time_utc: queryIndex.times_utc?.[frameIndex] || selection.frame?.time_utc || null,
    cell_latitude: cellValue === null ? null : latitudes[rowIndex] ?? null,
    cell_longitude: cellValue === null ? null : longitudes[columnIndex] ?? null,
    primary_value: primaryValue,
    bottom_depth_m: condition.depth_mode === "bottom" ? numericGridValue(frameData.components?.bottom_depth_m, rowIndex, columnIndex) : null,
    primary_unit: readableUnit(condition.units),
    note: primaryValue === null ? "No water cell at this location" : null
  };
  payload[condition.value_key || "value"] = primaryValue;
  return payload;
}

function infrastructureCategoryDefinition(categoryId) {
  return state.infrastructure.manifest?.layers?.find((layer) => layer.id === categoryId) ?? null;
}

function infrastructureCategoryLabel(categoryId) {
  const style = INFRASTRUCTURE_STYLES[categoryId];
  return t(style?.labelKey ?? "", style?.fallbackLabel ?? categoryId);
}

function infrastructureLayerIds(categoryId) {
  return {
    main: `infrastructure-${categoryId}`,
    accent: `infrastructure-${categoryId}-accent`,
    outline: `infrastructure-${categoryId}-outline`
  };
}

function infrastructureVisibility(categoryId) {
  return state.infrastructure.active && state.infrastructure.categories[categoryId] ? "visible" : "none";
}

function infrastructureInteractiveLayers() {
  return state.infrastructure.interactiveLayerIds.filter((layerId) => state.map?.getLayer(layerId));
}

function noiseLayerId(categoryId, variant = "main") {
  return `noise-${categoryId}-${variant}`;
}

function normalizeNoiseEventGroup(value) {
  const sourceEvent = String(value || "").trim().toLowerCase();
  if (sourceEvent.includes("pile")) {
    return "pile_driving";
  }
  if (sourceEvent.includes("airgun") || sourceEvent.includes("seismic")) {
    return "seismic_airgun";
  }
  if (sourceEvent.includes("explosion")) {
    return "explosion";
  }
  if (sourceEvent.includes("sonar") || sourceEvent.includes("deterrent")) {
    return "sonar_deterrent";
  }
  return sourceEvent ? "other_impulsive" : "unknown";
}

function noiseEventColorExpression() {
  const expression = ["match", ["get", "noise_event_group"]];
  for (const [groupId, group] of Object.entries(NOISE_EVENT_GROUPS)) {
    expression.push(groupId, group.color);
  }
  expression.push("#c8d4dc");
  return expression;
}

function hasTimeDrivenOverlay() {
  return oceanLayerVisible();
}

function hasAnyActiveOverlay() {
  return oceanLayerVisible() || state.infrastructure.active || state.noise.active;
}

function activeNoiseCategoryCount() {
  return NOISE_CATEGORY_ORDER.filter((categoryId) => state.noise.categories[categoryId]).length;
}

function activeInfrastructureCategoryCount() {
  return INFRASTRUCTURE_CATEGORY_ORDER.filter((categoryId) => state.infrastructure.categories[categoryId]).length;
}

function activeOceanConditionEntry() {
  return state.activeConditionId ? state.oceanConditions[state.activeConditionId] ?? null : null;
}

function activeConditionHasLocalData() {
  return Boolean(activeOceanConditionEntry()?.available && activeConditionMetadata());
}

function oceanConditionCardSummary() {
  const condition = activeConditionDefinition();
  if (!condition) {
    return t("map.noOverlaySubtitle", "Select an overlay to explore the Baltic Sea");
  }
  if (activeConditionHasLocalData()) {
    return formatTimestamp(currentFrame()?.time_utc, activeConditionMetadata()?.region?.time_zone ?? "UTC");
  }
  return "Placeholder until processed data is available";
}

function oceanConditionPlaceholderDefinition(conditionId) {
  return OCEAN_CONDITION_PLACEHOLDERS[conditionId] ?? {
    title: "Ocean-condition placeholder",
    copy: "This card is wired for shared time, a legend, and condition-specific controls when processed data becomes available."
  };
}

function isCompactControlLayout() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function activeControlCards() {
  return Object.entries(CONTROL_CARD_DEFINITIONS)
    .filter(([, definition]) => definition.active())
    .sort(([, left], [, right]) => (left.controlPriority ?? 0) - (right.controlPriority ?? 0));
}

function controlCardSummaryElement(cardId) {
  if (cardId === "oceanCondition") {
    return oceanConditionCardSummaryEl;
  }
  if (cardId === "noise") {
    return document.getElementById("noise-card-summary");
  }
  if (cardId === "infrastructure") {
    return document.getElementById("infrastructure-card-summary");
  }
  return null;
}

function controlCardCollapsed(cardId) {
  return Boolean(state.controlCards.collapsed[cardId]);
}

function renderActiveOverlayControls() {
  if (!activeOverlayControlsEl) {
    return;
  }

  const activeCards = activeControlCards();
  const activeCardIds = activeCards.map(([cardId]) => cardId);
  const defaultExpandedCardId = activeCardIds[0] ?? null;

  if (isCompactControlLayout()) {
    if (!state.controlCards.mobileExpandedId || !activeCardIds.includes(state.controlCards.mobileExpandedId)) {
      state.controlCards.mobileExpandedId = defaultExpandedCardId;
    }
  } else {
    state.controlCards.mobileExpandedId = null;
  }

  for (const [cardId, definition] of activeCards) {
    const root = CONTROL_CARD_ELEMENTS[cardId];
    if (!root) {
      continue;
    }

    const collapsed = controlCardCollapsed(cardId, defaultExpandedCardId);
    root.hidden = false;
    root.classList.toggle("is-collapsed", collapsed);
    if (root.parentElement !== activeOverlayControlsEl) activeOverlayControlsEl.appendChild(root);

    const summaryEl = controlCardSummaryElement(cardId);
    if (summaryEl) {
      summaryEl.textContent = definition.summary();
    }

    const toggleEl = root.querySelector(`[data-control-card-toggle="${cardId}"]`);
    if (toggleEl) {
      toggleEl.setAttribute("aria-expanded", String(!collapsed));
      const chevronEl = toggleEl.querySelector(".context-card-chevron");
      if (chevronEl) {
        chevronEl.textContent = collapsed ? "▾" : "▴";
      }
    }
  }

  for (const [cardId, root] of Object.entries(CONTROL_CARD_ELEMENTS)) {
    if (!root || activeCardIds.includes(cardId)) {
      continue;
    }
    root.hidden = true;
    root.classList.remove("is-collapsed");
  }

  updateBottomLeftVisibility();
}

function toggleControlCard(cardId) {
  const activeCardIds = activeControlCards().map(([activeId]) => activeId);
  if (!activeCardIds.includes(cardId)) {
    return;
  }

  if (isCompactControlLayout()) {
    if (state.controlCards.mobileExpandedId === cardId) {
      state.controlCards.mobileExpandedId = null;
      state.controlCards.collapsed[cardId] = true;
    } else {
      state.controlCards.mobileExpandedId = cardId;
      for (const activeId of activeCardIds) {
        state.controlCards.collapsed[activeId] = activeId !== cardId;
      }
    }
  } else {
    state.controlCards.collapsed[cardId] = !state.controlCards.collapsed[cardId];
  }

  renderActiveOverlayControls();
}

function updateBottomLeftVisibility() {
  syncPanelAccess();
  if (!mapBottomLeftEl) {
    return;
  }
  const hasVisibleCard = Object.values(CONTROL_CARD_ELEMENTS).some((element) => element && !element.hidden);
  mapBottomLeftEl.hidden = !hasVisibleCard && clickPanelEl.hidden;
}

function overlayInfoEntry(overlayId) {
  return state.translations.guides?.[overlayId] ?? null;
}

function renderOverlayInfoPanel() {
  if (!overlayInfoPanelEl || !overlayInfoTitleEl || !overlayInfoSubtitleEl || !overlayInfoBodyEl) {
    return;
  }

  const entry = overlayInfoEntry(state.overlayInfoId);
  if (!entry || state.mode !== "map") {
    overlayInfoPanelEl.hidden = true;
    overlayInfoPanelEl.classList.remove("is-open");
    overlayInfoBodyEl.innerHTML = "";
    overlayInfoButtonEls.forEach((button) => {
      button.classList.remove("is-active");
      button.setAttribute("aria-expanded", "false");
    });
    return;
  }

  const bottomOxygen = state.overlayInfoId === "oxygen" && state.oceanConditions.oxygen?.condition?.depth_mode === "bottom";
  const bottom = state.translations.guides.oxygenBottom;
  overlayInfoTitleEl.textContent = bottomOxygen ? bottom.title : entry.title;
  overlayInfoSubtitleEl.textContent = bottomOxygen ? bottom.subtitle : entry.subtitle;
  overlayInfoBodyEl.replaceChildren();
  entry.sections.forEach((section, index) => {
    const container = document.createElement("section");
    container.className = "overlay-info-section";
    const heading = document.createElement("p");
    heading.className = "overlay-info-section-title";
    heading.textContent = section.heading;
    const copy = document.createElement("p");
    copy.className = "overlay-info-section-copy";
    appendGuideText(copy, bottomOxygen && index === 0 ? bottom.body : section.body);
    container.append(heading, copy);
    overlayInfoBodyEl.append(container);
  });
  overlayInfoPanelEl.hidden = false;
  overlayInfoPanelEl.classList.add("is-open");

  overlayInfoButtonEls.forEach((button) => {
    const active = button.dataset.overlayInfoButton === state.overlayInfoId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-expanded", String(active));
  });
}

function toggleOverlayInfoPanel(overlayId) {
  state.overlayInfoId = state.overlayInfoId === overlayId ? null : overlayId;
  if (isCompactControlLayout()) state.drawerOpen = true;
  renderOverlayInfoPanel();
  syncPanelAccess();
  if (state.overlayInfoId) overlayInfoCloseEl.focus();
}

function activeHeadlineState() {
  const metadata = activeConditionMetadata();
  const condition = activeConditionDefinition();
  if (oceanLayerVisible() && metadata && condition) {
    return {
      title: condition.label,
      subtitle: formatTimestamp(currentFrame()?.time_utc, metadata.region.time_zone)
    };
  }

  if (condition) {
    return {
      title: condition.label,
      subtitle: msg("No published data for this layer")
    };
  }

  if (state.noise.active) {
    return {
      title: t("layers.underwaterNoise", "Underwater Noise"),
      subtitle: t("noise.assessmentPeriod", "HELCOM assessment layers · 2016-2021")
    };
  }

  if (state.infrastructure.active) {
    return {
      title: t("layers.infrastructure", "Coastal & Marine Infrastructure"),
      subtitle: t("infrastructure.staticContext", "Static context overlay")
    };
  }

  return {
    title: t("map.noOverlayTitle", "Map view"),
    subtitle: t("map.noOverlaySubtitle", "Select an overlay to explore the Baltic Sea")
  };
}

function updateOverlayDependentPanels() {
  if (!oceanLayerVisible()) {
    clickPanelEl.hidden = true;
  }
  updateBottomLeftVisibility();
}

function renderInfrastructureCategoryButtons() {
  if (!infrastructureCategoryListEl) {
    return;
  }

  infrastructureCategoryListEl.innerHTML = "";
  for (const categoryId of INFRASTRUCTURE_CATEGORY_ORDER) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "infrastructure-category-toggle";
    button.dataset.infrastructureCategory = categoryId;

    const active = Boolean(state.infrastructure.categories[categoryId]);
    button.classList.toggle("is-selected", active);
    button.innerHTML = `
      <span class="infrastructure-category-main">
        <span class="layer-tick">${active ? "✓" : ""}</span>
        <span>${infrastructureCategoryLabel(categoryId)}</span>
      </span>
      <span class="infrastructure-category-meta">${t(INFRASTRUCTURE_STYLES[categoryId].styleLabelKey, INFRASTRUCTURE_STYLES[categoryId].styleFallback)}</span>
    `;
    button.addEventListener("click", () => {
      toggleInfrastructureCategory(categoryId).catch((error) => {
        console.error(error);
        setStatus(msg("This infrastructure category could not be loaded. Its source details remain available."), "error");
      });
    });
    infrastructureCategoryListEl.appendChild(button);
  }
}

function renderInfrastructureLegend() {
  if (!infrastructureLegendEl) {
    return;
  }

  if (!state.infrastructure.active) {
    infrastructureLegendEl.hidden = true;
    infrastructureLegendEl.innerHTML = "";
    return;
  }

  const activeCategories = INFRASTRUCTURE_CATEGORY_ORDER.filter((categoryId) => state.infrastructure.categories[categoryId]);
  if (activeCategories.length === 0) {
    infrastructureLegendEl.hidden = true;
    infrastructureLegendEl.innerHTML = "";
    return;
  }

  const rows = activeCategories.map((categoryId) => {
    const style = INFRASTRUCTURE_STYLES[categoryId];
    const swatchClass =
      style.legendType === "point"
        ? "legend-swatch is-point"
        : style.legendType === "fill"
          ? "legend-swatch is-fill"
          : style.legendType === "route"
            ? "legend-swatch is-route"
            : `legend-swatch is-line${style.legendType === "dashed" ? " legend-dashed" : ""}`;
    const swatchStyle =
      style.legendType === "fill"
        ? `background:${style.color}; color:${style.lineColor ?? style.color};`
        : `background:${style.color}; color:${style.color};`;
    return `
      <div class="infrastructure-legend-row">
        <span class="infrastructure-legend-label">
          <span class="${swatchClass}" style="${swatchStyle}"></span>
          <span>${infrastructureCategoryLabel(categoryId)}</span>
        </span>
        <span>${t(style.styleLabelKey, style.styleFallback)}</span>
      </div>
    `;
  });

  infrastructureLegendEl.hidden = false;
  infrastructureLegendEl.innerHTML = `
    <p class="legend-caption">${t("infrastructure.legendTitle", "Legend")}</p>
    ${rows.join("")}
  `;
}

function updateInfrastructureUi() {
  if (!infrastructureToggleEl || !infrastructurePanelEl) {
    return;
  }

  setLayerButton(
    infrastructureToggleEl,
    t("layers.infrastructure", "Coastal & Marine Infrastructure"),
    state.infrastructure.active
  );
  renderInfrastructureCategoryButtons();
  renderInfrastructureLegend();
}

function renderNoiseCategoryButtons() {
  if (!noiseCategoryListEl) {
    return;
  }

  noiseCategoryListEl.innerHTML = "";
  for (const categoryId of NOISE_CATEGORY_ORDER) {
    const definition = NOISE_LAYER_DEFINITIONS[categoryId];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "infrastructure-category-toggle";
    const active = Boolean(state.noise.categories[categoryId]);
    button.classList.toggle("is-selected", active);
    button.innerHTML = `
      <span class="infrastructure-category-main">
        <span class="layer-tick">${active ? "✓" : ""}</span>
        <span>${t(definition.labelKey, definition.fallbackLabel)}</span>
      </span>
      <span class="infrastructure-category-meta">${definition.period}</span>
    `;
    button.addEventListener("click", () => {
      toggleNoiseCategory(categoryId).catch((error) => {
        console.error(error);
        setStatus(msg("This noise category could not be loaded. Its historical guide remains available."), "error");
      });
    });
    noiseCategoryListEl.appendChild(button);
  }
}

function renderNoiseLegend() {
  if (!noiseLegendEl) {
    return;
  }

  if (!state.noise.active) {
    noiseLegendEl.hidden = true;
    noiseLegendEl.innerHTML = "";
    return;
  }

  const rows = [];
  if (state.noise.categories.continuousNoise) {
    rows.push(`
      <div class="infrastructure-legend-row">
        <span class="infrastructure-legend-label">
          <span class="legend-swatch is-fill" style="background:rgba(92, 157, 214, 0.42); color:rgba(92, 157, 214, 0.42);"></span>
          <span>${t("noise.legendContinuous", "HELCOM continuous-noise pressure")}</span>
        </span>
        <span>${t("noise.legendNoDb", "Not shown as dB")}</span>
      </div>
    `);
  }
  if (state.noise.categories.impulsivePressure) {
    rows.push(`
      <div class="infrastructure-legend-row">
        <span class="infrastructure-legend-label">
          <span class="legend-swatch is-fill" style="background:rgba(232, 143, 87, 0.4); color:rgba(232, 143, 87, 0.4);"></span>
          <span>${t("noise.legendImpulsivePressure", "HELCOM impulsive-noise pressure")}</span>
        </span>
        <span>${t("noise.legendPressureIndex", "Pressure index")}</span>
      </div>
    `);
  }
  if (state.noise.categories.ecologicalEffect) {
    rows.push(`
      <div class="infrastructure-legend-row">
        <span class="infrastructure-legend-label">
          <span class="legend-swatch is-fill" style="background:rgba(190, 114, 192, 0.38); color:rgba(190, 114, 192, 0.38);"></span>
          <span>${t("noise.legendImpact", "Potential impact on mobile species")}</span>
        </span>
        <span>${t("noise.legendImpactIndex", "Impact index")}</span>
      </div>
    `);
  }
  if (state.noise.categories.impulsiveEvents) {
    for (const [groupId, group] of Object.entries(NOISE_EVENT_GROUPS)) {
      rows.push(`
        <div class="infrastructure-legend-row">
          <span class="infrastructure-legend-label">
            <span class="legend-swatch is-point" style="background:${group.color}; color:${group.color};"></span>
            <span>${t(group.labelKey, group.fallbackLabel)}</span>
          </span>
          <span>${t("noise.legendReportedEvent", "Reported event")}</span>
        </div>
      `);
    }
  }

  if (rows.length === 0) {
    noiseLegendEl.hidden = true;
    noiseLegendEl.innerHTML = "";
    return;
  }

  noiseLegendEl.hidden = false;
  noiseLegendEl.innerHTML = `
    <p class="legend-caption">${t("noise.legendTitle", "Noise legend")}</p>
    ${rows.join("")}
  `;
}

function updateNoiseUi() {
  if (!noiseToggleEl || !noisePanelEl) {
    return;
  }

  setLayerButton(noiseToggleEl, t("layers.underwaterNoise", "Underwater Noise"), state.noise.active);
  renderNoiseCategoryButtons();
  renderNoiseLegend();
}

async function ensureInfrastructureManifest() {
  if (state.infrastructure.manifest) {
    return state.infrastructure.manifest;
  }

  const response = await fetch(INFRASTRUCTURE_MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Infrastructure manifest could not be loaded.");
  }

  state.infrastructure.manifest = await response.json();
  return state.infrastructure.manifest;
}

function registerNoiseEventPopup(layerId) {
  state.map.on("mouseenter", layerId, () => {
    state.map.getCanvas().style.cursor = "pointer";
  });
  state.map.on("mouseleave", layerId, () => {
    state.map.getCanvas().style.cursor = "";
  });
  state.map.on("click", layerId, (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }

    const props = feature.properties || {};
    const groupId = props.noise_event_group || normalizeNoiseEventGroup(props.Source_Event);
    const rows = [
      [t("noise.popupEvent", "Event"), t(NOISE_EVENT_GROUPS[groupId]?.labelKey, NOISE_EVENT_GROUPS[groupId]?.fallbackLabel || "Reported event")],
      [t("noise.popupCountry", "Country"), props.Country],
      [t("noise.popupYear", "Year"), props.Year],
      [t("noise.popupStart", "Start"), props.start_date_iso || props.start_date],
      [t("noise.popupEnd", "End"), props.end_date_iso || props.end_date],
      [t("noise.popupMitigation", "Mitigation"), props.sound_mitigation_bool],
      [t("noise.popupValueCode", "Value code"), props.Value_Code]
    ]
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([label, value]) => `<div class="popup-line"><strong>${label}:</strong> ${value}</div>`)
      .join("");

    state.popup?.remove();
    state.popup = new state.maplibregl.Popup({
      offset: 18,
      closeButton: false,
      className: "ship-popup"
    })
      .setLngLat(event.lngLat)
      .setHTML(`
        <div class="popup-title">${t("noise.popupReportedEvent", "Reported impulsive-noise event")}</div>
        <div class="popup-type">${props.Source_Event || t("noise.popupUnknownType", "Unknown event type")}</div>
        ${rows}
        <div class="popup-line"><strong>${t("noise.dataSource", "Data source")}:</strong> HELCOM HOLAS 3 / HELCOM-OSPAR register</div>
      `)
      .addTo(state.map);
  });
}

function setNoiseCategoryVisibility(categoryId) {
  const visibility = state.noise.active && state.noise.categories[categoryId] ? "visible" : "none";
  for (const layerId of [
    noiseLayerId(categoryId, "main"),
    noiseLayerId(categoryId, "outline"),
    noiseLayerId(categoryId, "points"),
    noiseLayerId(categoryId, "polygons")
  ]) {
    if (state.map?.getLayer(layerId)) {
      state.map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }
}

function ensureNoiseRasterLayer(categoryId) {
  if (state.noise.loaded[categoryId]) {
    return;
  }
  const definition = NOISE_LAYER_DEFINITIONS[categoryId];
  const sourceId = noiseLayerId(categoryId, "source");
  const layerId = noiseLayerId(categoryId, "main");
  state.map.addSource(sourceId, {
    type: "raster",
    tiles: definition.tiles,
    tileSize: 256
  });
  const beforeLayerId = state.map.getLayer("selected-location-ring") ? "selected-location-ring" : undefined;
  state.map.addLayer(
    {
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: definition.paint,
      layout: { visibility: state.noise.active && state.noise.categories[categoryId] ? "visible" : "none" }
    },
    beforeLayerId
  );
  state.noise.loaded[categoryId] = true;
}

function ensureNoiseEventLayers() {
  if (state.noise.loaded.impulsiveEvents) {
    return;
  }

  const beforeLayerId = state.map.getLayer("selected-location-ring") ? "selected-location-ring" : undefined;
  state.map.addSource(noiseLayerId("impulsiveEvents", "points-source"), {
    type: "geojson",
    data: NOISE_LAYER_DEFINITIONS.impulsiveEvents.pointsUrl
  });
  state.map.addSource(noiseLayerId("impulsiveEvents", "polygons-source"), {
    type: "geojson",
    data: NOISE_LAYER_DEFINITIONS.impulsiveEvents.polygonsUrl
  });
  state.map.addLayer(
    {
      id: noiseLayerId("impulsiveEvents", "polygons"),
      type: "fill",
      source: noiseLayerId("impulsiveEvents", "polygons-source"),
      paint: {
        "fill-color": noiseEventColorExpression(),
        "fill-opacity": 0.16
      },
      layout: { visibility: state.noise.active && state.noise.categories.impulsiveEvents ? "visible" : "none" }
    },
    beforeLayerId
  );
  state.map.addLayer(
    {
      id: noiseLayerId("impulsiveEvents", "outline"),
      type: "line",
      source: noiseLayerId("impulsiveEvents", "polygons-source"),
      paint: {
        "line-color": noiseEventColorExpression(),
        "line-width": 1,
        "line-opacity": 0.55
      },
      layout: { visibility: state.noise.active && state.noise.categories.impulsiveEvents ? "visible" : "none" }
    },
    beforeLayerId
  );
  state.map.addLayer(
    {
      id: noiseLayerId("impulsiveEvents", "points"),
      type: "circle",
      source: noiseLayerId("impulsiveEvents", "points-source"),
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 12, 6.5],
        "circle-color": noiseEventColorExpression(),
        "circle-stroke-color": "#081623",
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.92
      },
      layout: { visibility: state.noise.active && state.noise.categories.impulsiveEvents ? "visible" : "none" }
    },
    beforeLayerId
  );

  registerNoiseEventPopup(noiseLayerId("impulsiveEvents", "points"));
  registerNoiseEventPopup(noiseLayerId("impulsiveEvents", "polygons"));
  state.noise.loaded.impulsiveEvents = true;
}

function ensureNoiseCategoryLoaded(categoryId) {
  if (categoryId === "impulsiveEvents") {
    ensureNoiseEventLayers();
    return;
  }
  ensureNoiseRasterLayer(categoryId);
}

function noiseInteractiveLayers() {
  return [noiseLayerId("impulsiveEvents", "points"), noiseLayerId("impulsiveEvents", "polygons")].filter((layerId) =>
    state.map?.getLayer(layerId)
  );
}

async function toggleNoiseCategory(categoryId) {
  ensureNoiseCategoryLoaded(categoryId);
  state.noise.categories[categoryId] = !state.noise.categories[categoryId];
  setNoiseCategoryVisibility(categoryId);
  updateNoiseUi();
  updateTransparencyPanel();
  updateOverlayDependentPanels();
}

function toggleNoiseOverlay() {
  state.noise.active = !state.noise.active;
  if (state.noise.active) {
    for (const categoryId of NOISE_CATEGORY_ORDER) {
      if (state.noise.categories[categoryId]) {
        ensureNoiseCategoryLoaded(categoryId);
      }
    }
  }
  for (const categoryId of NOISE_CATEGORY_ORDER) {
    setNoiseCategoryVisibility(categoryId);
  }
  updateNoiseUi();
  updateLayerToggleUi();
  updateTransparencyPanel();
  updateOverlayDependentPanels();
  updateChrome();
}

function buildInfrastructurePopup(feature) {
  const props = feature.properties || {};
  const categoryId = props.category || props.infra_category;

  const rowsByCategory = {
    ports: [
      [t("infrastructure.country", "Country"), props.country],
      [t("infrastructure.type", "Type"), props.type || props.infra_subtype],
      [t("infrastructure.importance", "Role"), props.importance]
    ],
    powerPlants: [
      [t("infrastructure.country", "Country"), props.country],
      [t("infrastructure.energySource", "Energy source"), props.energy_source || props.infra_subtype],
      [t("infrastructure.capacity", "Capacity"), props.capacity || (props.capacity_mw ? `${props.capacity_mw} MW` : null)],
      [t("infrastructure.status", "Status"), props.status]
    ],
    windFarms: [
      [t("infrastructure.country", "Country"), props.country],
      [t("infrastructure.status", "Status"), props.status],
      [t("infrastructure.capacity", "Capacity"), props.capacity || (props.capacity_mw ? `${props.capacity_mw} MW` : null)],
      [t("infrastructure.turbines", "Turbines"), props.turbines]
    ],
    cables: [
      [t("infrastructure.type", "Type"), props.type || props.infra_subtype],
      [t("infrastructure.connection", "Connection"), props.connection],
      [t("infrastructure.capacity", "Capacity"), props.capacity]
    ],
    pipelines: [
      [t("infrastructure.type", "Type"), props.type || props.infra_subtype],
      [t("infrastructure.connection", "Connection"), props.connection],
      [t("infrastructure.status", "Status"), props.status]
    ],
    shipping: [
      [t("infrastructure.role", "Role"), props.role],
      [t("infrastructure.traffic", "Traffic"), props.traffic]
    ],
    landUse: [
      [t("infrastructure.type", "Type"), props.land_use || props.infra_subtype],
      [t("infrastructure.context", "Context"), props.context]
    ]
  };

  const lines = (rowsByCategory[categoryId] ?? [])
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="popup-line"><strong>${label}:</strong> ${value}</div>`)
    .join("");

  return `
    <div class="popup-title">${props.name || infrastructureCategoryLabel(categoryId)}</div>
    <div class="popup-type">${infrastructureCategoryLabel(categoryId)}</div>
    ${lines}
    <div class="popup-line"><strong>${t("infrastructure.dataSource", "Data source")}:</strong> ${props.source_name || props.source || "Prototype bundle"}</div>
  `;
}

function registerInfrastructureLayerEvents(layerId) {
  if (!state.map || state.infrastructure.interactiveLayerIds.includes(layerId)) {
    return;
  }

  state.infrastructure.interactiveLayerIds.push(layerId);
  state.map.on("mouseenter", layerId, () => {
    state.map.getCanvas().style.cursor = "pointer";
  });
  state.map.on("mouseleave", layerId, () => {
    state.map.getCanvas().style.cursor = "";
  });
  state.map.on("click", layerId, (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }

    state.popup?.remove();
    state.popup = new state.maplibregl.Popup({
      offset: 18,
      closeButton: false,
      className: "ship-popup"
    })
      .setLngLat(event.lngLat)
      .setHTML(buildInfrastructurePopup(feature))
      .addTo(state.map);
  });
}

function addInfrastructureCategoryLayers(categoryId, data) {
  const style = INFRASTRUCTURE_STYLES[categoryId];
  const layerIds = infrastructureLayerIds(categoryId);
  const sourceId = layerIds.main;
  if (state.map.getSource(sourceId)) {
    return;
  }

  state.map.addSource(sourceId, {
    type: "geojson",
    data
  });

  const beforeLayerId = state.map.getLayer("selected-location-ring") ? "selected-location-ring" : undefined;

  if (style.layerType === "circle") {
    state.map.addLayer(
      {
        id: layerIds.main,
        type: "circle",
        source: sourceId,
        paint: style.paint,
        layout: { visibility: infrastructureVisibility(categoryId) }
      },
      beforeLayerId
    );
    registerInfrastructureLayerEvents(layerIds.main);
    return;
  }

  if (style.layerType === "line") {
    state.map.addLayer(
      {
        id: layerIds.main,
        type: "line",
        source: sourceId,
        paint: style.paint,
        layout: { "line-join": "round", "line-cap": "round", visibility: infrastructureVisibility(categoryId) }
      },
      beforeLayerId
    );
    if (style.accentPaint) {
      state.map.addLayer(
        {
          id: layerIds.accent,
          type: "line",
          source: sourceId,
          paint: style.accentPaint,
          layout: { "line-join": "round", "line-cap": "round", visibility: infrastructureVisibility(categoryId) }
        },
        beforeLayerId
      );
      registerInfrastructureLayerEvents(layerIds.accent);
    } else {
      registerInfrastructureLayerEvents(layerIds.main);
    }
    return;
  }

  if (style.layerType === "fill") {
    state.map.addLayer(
      {
        id: layerIds.main,
        type: "fill",
        source: sourceId,
        paint: style.paint,
        layout: { visibility: infrastructureVisibility(categoryId) }
      },
      beforeLayerId
    );
    state.map.addLayer(
      {
        id: layerIds.outline,
        type: "line",
        source: sourceId,
        paint: style.outlinePaint,
        layout: { visibility: infrastructureVisibility(categoryId) }
      },
      beforeLayerId
    );
    registerInfrastructureLayerEvents(layerIds.main);
  }
}

function setInfrastructureCategoryVisibility(categoryId) {
  const layerIds = infrastructureLayerIds(categoryId);
  const visibility = infrastructureVisibility(categoryId);
  for (const layerId of [layerIds.main, layerIds.accent, layerIds.outline]) {
    if (state.map?.getLayer(layerId)) {
      state.map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }
}

async function loadInfrastructureCategory(categoryId) {
  await ensureInfrastructureManifest();
  if (state.infrastructure.loadedCategories[categoryId]) {
    return;
  }

  const manifestCategory =
    state.infrastructure.manifest.categories?.find((item) => item.id === categoryId) ||
    infrastructureCategoryDefinition(categoryId);
  if (!manifestCategory?.url) {
    throw new Error(`Infrastructure category "${categoryId}" is missing a data URL.`);
  }

  const response = await fetch(new URL(manifestCategory.url, window.location.href).toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${infrastructureCategoryLabel(categoryId)} could not be loaded.`);
  }

  const data = await response.json();
  addInfrastructureCategoryLayers(categoryId, data);
  state.infrastructure.loadedCategories[categoryId] = true;
}

async function ensureInfrastructureOverlayReady() {
  await ensureInfrastructureManifest();
  for (const categoryId of INFRASTRUCTURE_CATEGORY_ORDER) {
    await loadInfrastructureCategory(categoryId);
  }
  state.infrastructure.loaded = true;
}

async function toggleInfrastructureOverlay() {
  if (!state.infrastructure.active) {
    setStatus(t("status.loadingInfrastructure", "Loading infrastructure overlay..."));
    await ensureInfrastructureOverlayReady();
    clearStatus();
  }

  state.infrastructure.active = !state.infrastructure.active;
  for (const categoryId of INFRASTRUCTURE_CATEGORY_ORDER) {
    setInfrastructureCategoryVisibility(categoryId);
  }
  updateInfrastructureUi();
  updateLayerToggleUi();
  updateTransparencyPanel();
  updateOverlayDependentPanels();
}

async function toggleInfrastructureCategory(categoryId) {
  if (!state.infrastructure.active) {
    await toggleInfrastructureOverlay();
  }
  if (!state.infrastructure.loadedCategories[categoryId]) {
    await loadInfrastructureCategory(categoryId);
  }

  state.infrastructure.categories[categoryId] = !state.infrastructure.categories[categoryId];
  setInfrastructureCategoryVisibility(categoryId);
  updateInfrastructureUi();
  renderActiveOverlayControls();
}

function mapStyle() {
  return {
    version: 8,
    sources: {
      "eox-satellite": { type: "raster", tiles: [EOX_SATELLITE_TILES], tileSize: 256, minzoom: 0, maxzoom: 14 },
      "eox-blackmarble": { type: "raster", tiles: [EOX_BLACKMARBLE_TILES], tileSize: 256, minzoom: 0, maxzoom: 18 },
      "eox-labels": { type: "raster", tiles: [EOX_LABELS_TILES], tileSize: 256, minzoom: 0, maxzoom: 18 },
      "eox-streets": { type: "raster", tiles: [EOX_STREETS_TILES], tileSize: 256, minzoom: 0, maxzoom: 18 },
      "eox-bright-labels": { type: "raster", tiles: [EOX_BRIGHT_LABELS_TILES], tileSize: 256, minzoom: 0, maxzoom: 18 },
      "eox-coastline": { type: "raster", tiles: [EOX_COASTLINE_TILES], tileSize: 256, minzoom: 0, maxzoom: 18 }
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#040814" } },
      { id: "eox-satellite", type: "raster", source: "eox-satellite", paint: { "raster-fade-duration": 0, "raster-saturation": 0.06, "raster-contrast": 0.1 } },
      { id: "eox-blackmarble", type: "raster", source: "eox-blackmarble", paint: { "raster-fade-duration": 0, "raster-opacity": 0 } },
      { id: "eox-streets", type: "raster", source: "eox-streets", paint: { "raster-fade-duration": 0, "raster-opacity": 0.32 } },
      { id: "eox-labels", type: "raster", source: "eox-labels", paint: { "raster-fade-duration": 0, "raster-opacity": 0.92 } },
      { id: "eox-bright-labels", type: "raster", source: "eox-bright-labels", layout: { visibility: "none" }, paint: { "raster-fade-duration": 0, "raster-opacity": 0.9 } },
      { id: "eox-coastline", type: "raster", source: "eox-coastline", paint: { "raster-fade-duration": 0, "raster-opacity": 0.72 } }
    ]
  };
}

function updateStaticPanels() {
  sourceDetailEl.textContent = t("transparency.temperatureDetail", "Modelled sea-surface temperature");
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function getPaletteDefinition() {
  return TEMPERATURE_PALETTES[oceanPaletteName()] || TEMPERATURE_PALETTES.blueRed;
}

function buildPaletteGradient(palette = getPaletteDefinition()) {
  return `linear-gradient(90deg, ${palette.stops.map(({ stop, color }) => `${color} ${Math.round(stop * 100)}%`).join(", ")})`;
}

function interpolatePaletteColor(value, palette = getPaletteDefinition()) {
  if (value <= palette.stops[0].stop) {
    return hexToRgb(palette.stops[0].color);
  }
  if (value >= palette.stops[palette.stops.length - 1].stop) {
    return hexToRgb(palette.stops[palette.stops.length - 1].color);
  }

  for (let index = 0; index < palette.stops.length - 1; index += 1) {
    const start = palette.stops[index];
    const end = palette.stops[index + 1];
    if (value >= start.stop && value <= end.stop) {
      const startColor = hexToRgb(start.color);
      const endColor = hexToRgb(end.color);
      const ratio = (value - start.stop) / (end.stop - start.stop || 1);
      return {
        r: Math.round(startColor.r + (endColor.r - startColor.r) * ratio),
        g: Math.round(startColor.g + (endColor.g - startColor.g) * ratio),
        b: Math.round(startColor.b + (endColor.b - startColor.b) * ratio)
      };
    }
  }

  return hexToRgb("#ffffff");
}

function updateLegendAppearance() {
  const gradient = buildPaletteGradient();
  document.querySelectorAll(".legend-bar, .timeline-legend-bar").forEach((element) => {
    element.style.background = gradient;
  });
  if (oceanConditionLegendBarEl && state.activeConditionId) {
    oceanConditionLegendBarEl.style.background = gradient;
  }
}

function updatePaletteButtons() {
  const oceanConditionActive = Boolean(state.activeConditionId);
  for (const button of paletteOptionEls) {
    button.classList.toggle("is-selected", button.dataset.palette === oceanPaletteName());
    button.disabled = !oceanConditionActive;
  }
  paletteButtonEl.disabled = !oceanConditionActive;
  paletteCurrentEl.textContent = t("accessibility.scaleButton", "Colorscale");
  for (const preview of palettePreviewEls) {
    const paletteName = preview.dataset.palettePreview;
    const palette = TEMPERATURE_PALETTES[paletteName] ?? TEMPERATURE_PALETTES.blueRed;
    preview.style.background = buildPaletteGradient(palette);
  }
}

function updateChrome() {
  const condition = activeConditionDefinition(), metadata = activeConditionMetadata(), frame = currentFrame();
  const headline = activeHeadlineState();
  mapHeadlineTitleEl.textContent = headline.title;
  mapHeadlineTimeEl.textContent = headline.subtitle;
  oceanConditionCardLabelEl.textContent = condition?.label || msg("Ocean condition");
  oceanConditionCardSummaryEl.textContent = oceanConditionCardSummary();
  timePrimaryEl.textContent = frame ? formatTimestamp(frame.time_utc) : msg("No published time steps for this layer");
  timeSliderEl.setAttribute("aria-valuetext", timePrimaryEl.textContent);
  timeSecondaryEl.textContent = frame ? `${intervalLabel(metadata)}${state.requestedTimeUtc && frame.time_utc !== state.requestedTimeUtc ? msg(". Nearest available time used.") : ""}` : msg("Choose another layer to browse available data.");
  const notice = document.getElementById("forecast-notice");
  notice.textContent = forecastArchived(metadata) ? msg("Archived forecast — not current conditions.") : (frame ? msg("Modelled analysis / forecast; not a direct observation.") : msg("This layer has no published data."));
  document.getElementById("dataset-update").textContent = msg("Dataset last successful update: {time}", {time: formatTimestamp(metadata?.provenance?.retrieved_at_utc)});
  const currentValue = state.selectedLocation?.sampleText;
  oceanConditionCurrentValueEl.textContent = currentValue || (state.selectedLocation && state.mapReady && frame ? msg("Loading location value…") : `${condition?.value_label || condition?.label || ""} · ${readableUnit(condition?.units)}`);
  oceanConditionCurrentNoteEl.textContent = state.selectedLocation ? `${formatCoordinate(state.selectedLocation.latitude, "N", "S")} · ${formatCoordinate(state.selectedLocation.longitude, "E", "W")}` : (state.mapReady ? msg("Tap the map to sample an interpolated water value.") : msg("Location sampling needs the interactive map."));
  const loadStatus = document.getElementById("frame-load-status");
  loadStatus.textContent = state.frameStatus === "loading" ? msg("Loading selected frame…") : state.frameStatus === "error" ? msg("This frame could not be loaded. Choose another time or layer.") : state.frameQuality?.invalidCount ? msg("{count} invalid values excluded; source values have not been clamped.", {count:state.frameQuality.invalidCount}) : "";
  oceanConditionLegendEl.hidden = !frame;
  oceanConditionPlaceholderEl.hidden = Boolean(frame);
  oceanConditionPlaceholderEl.textContent = frame ? "" : msg("Published data are unavailable for this layer. Its explanatory guide remains available.");
  if (frame) {
    const range = displayRangeForMetadata(metadata, condition);
    const min = state.frameQuality ? state.frameQuality.min : frame.min_celsius ?? frame.min_value ?? frame.min;
    const max = state.frameQuality ? state.frameQuality.max : frame.max_celsius ?? frame.max_value ?? frame.max;
    const invalidRange = nonnegativeQuantity(condition) && min < 0;
    const directionOnly = oceanVectorLayerVisible() && !oceanScalarLayerVisible();
    for (const node of oceanConditionLegendEl.querySelectorAll(".timeline-legend-bar, .legend-scale, .scale-note")) node.hidden = directionOnly;
    oceanConditionLegendTitleEl.textContent = directionOnly ? msg("Direction only — no colour field") : msg("Colour scale · {palette}", {palette:t(getPaletteDefinition().labelKey, getPaletteDefinition().fallbackLabel)});
    oceanConditionLegendRangeEl.textContent = invalidRange ? msg("Frame range contains invalid negative values") : (Number.isFinite(min) && Number.isFinite(max) ? msg("Frame data range: {range}", {range:`${min.toFixed(2)}–${max.toFixed(2)} ${readableUnit(condition.units)}`}) : msg("Frame data range unavailable"));
    oceanConditionLegendMinEl.textContent = String(range.min);
    oceanConditionLegendMaxEl.textContent = String(range.max);
    oceanConditionLegendUnitEl.textContent = readableUnit(condition.units);
  }
  renderOceanRenderModes();
  renderActiveOverlayControls();
  updateLegendAppearance();
  updateDataSummary();
}

function updateTransparencyPanel() {
  sourceSummaryEl.textContent = msg("Sources and dataset context");
  sourceDetailEl.textContent = msg("Data are updated manually in this prototype. All times are UTC.");
  transparencyDetailEl.replaceChildren();
  for (const id of [state.activeConditionId, state.noise.active && "noise", state.infrastructure.active && "infrastructure"].filter(Boolean)) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = layerLabel(id);
    details.append(summary);
    if (id === state.activeConditionId) details.open = true;
    appendLayerMetadata(details, id);
    transparencyDetailEl.append(details);
  }
}

function updateFallbackAppearance() {
  if (!state.map?.getLayer("land-mask")) {
    return;
  }

  state.map.setPaintProperty("land-mask", "raster-opacity", state.satelliteWorking ? 0.03 : 0.98);
  updateTransparencyPanel();
  if (!state.satelliteWorking) {
    setStatus(t("status.fallbackMap", "The live basemap did not load, so the viewer fell back to the local coastline layer."), "warning");
  }
}

function applyNightMode(frame) {
  if (!state.mapReady || !frame) {
    return;
  }

  const nightOpacity = frame.is_night ? 0.95 : 0;
  const satelliteOpacity = frame.is_night ? 0.22 : 1;
  const dayLabels = state.labelsVisible && !frame.is_night ? "visible" : "none";
  const nightLabels = state.labelsVisible && frame.is_night ? "visible" : "none";

  state.map.setPaintProperty("eox-blackmarble", "raster-opacity", nightOpacity);
  state.map.setPaintProperty("eox-satellite", "raster-opacity", satelliteOpacity);
  state.map.setPaintProperty("eox-streets", "raster-opacity", frame.is_night ? 0.18 : 0.32);
  state.map.setLayoutProperty("eox-labels", "visibility", dayLabels);
  state.map.setLayoutProperty("eox-streets", "visibility", state.labelsVisible ? "visible" : "none");
  state.map.setLayoutProperty("eox-bright-labels", "visibility", nightLabels);

}

function addOceanLayers() {
  const metadata = activeConditionMetadata();
  ensureOceanSources();
  if (!metadata?.fallback || state.map.getSource("land-mask")) {
    return;
  }

  state.map.addSource("land-mask", {
    type: "image",
    url: metadata.fallback.land_mask_url,
    coordinates:
      metadata.fallback.land_mask_coordinates ??
      imageCoordinatesFromBbox([
        [metadata.region.bbox.minimum_longitude, metadata.region.bbox.minimum_latitude],
        [metadata.region.bbox.maximum_longitude, metadata.region.bbox.maximum_latitude]
      ])
  });
  state.map.addLayer({
    id: "land-mask",
    type: "raster",
    source: "land-mask",
    paint: { "raster-opacity": state.satelliteWorking ? 0.03 : 0.98, "raster-fade-duration": 0 }
  });
  refreshOceanVisuals().catch((error) => {
    console.error(error);
  });
}

function ensureSelectedLocationLayer() {
  if (state.map.getSource("selected-location")) {
    return;
  }

  state.map.addSource("selected-location", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });
  state.map.addLayer({
    id: "selected-location-ring",
    type: "circle",
    source: "selected-location",
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(0, 0, 0, 0)",
      "circle-stroke-color": "#dff7ff",
      "circle-stroke-width": 2.2
    }
  });
  state.map.addLayer({
    id: "selected-location-dot",
    type: "circle",
    source: "selected-location",
    paint: {
      "circle-radius": 4,
      "circle-color": "#7bd0c6",
      "circle-stroke-color": "#0b1c2d",
      "circle-stroke-width": 1.4
    }
  });
}

function setSelectedLocationMarker() {
  const source = state.map?.getSource("selected-location");
  if (!source) {
    return;
  }

  const data = state.selectedLocation
    ? {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [state.selectedLocation.longitude, state.selectedLocation.latitude]
            }
          }
        ]
      }
    : { type: "FeatureCollection", features: [] };

  source.setData(data);
}

function updateOverlayFrame() {
  state.selectionVersion++;
  state.selectedLocationRequestToken++;
  state.oceanVisuals.requestToken++;
  state.frameQuality = null;
  state.frameStatus = state.mapReady && currentFrame() ? "loading" : "idle";
  if (state.selectedLocation) state.selectedLocation.sampleText = null;
  clickPanelEl.hidden = true;
  clearOceanVisuals();
  syncTimelineUi();
  updateChrome();
  updateTransparencyPanel();
  const selection = selectionSnapshot();
  if (state.overlayInfoId) renderOverlayInfoPanel();
  // Metadata browsing and the timeline remain useful without WebGL.
  loadActiveQueryIndex(selection).then(() => {
    if (selectionIsCurrent(selection)) updateTransparencyPanel();
  }).catch(error => console.error(error));
  if (!state.mapReady) return;
  applyNightMode(selection.frame);
  refreshOceanVisuals(selection);
  updateSelectedLocationValues(selection);
}

function setOceanVisibility() {
  updateOceanLayerStyles();
  updateChrome();
}

function updateViewToggle() {
  viewToggleEl.textContent = state.labelsVisible ? t("map.hideLabels", "Hide labels") : t("map.showLabels", "Show labels");
}

function setLayerButton(button, label, active) {
  if (!button) {
    return;
  }
  button.classList.toggle("is-selected", active);
  button.setAttribute("aria-pressed", String(active));
  button.innerHTML = `
    <span class="layer-main">
      <span class="layer-tick">${active ? "✓" : ""}</span>
      <span>${label}</span>
    </span>
  `;
}

function updateStatusForVisibleLayers() {
  if (state.mapFailed) setStatus(msg("Map unavailable. Layer guides and published timestamps remain available."), "warning");
}

function updateOceanConditionButtons() {
  for (const conditionId of OCEAN_CONDITION_ORDER) {
    const button = OCEAN_CONDITION_BUTTONS[conditionId];
    if (!button) {
      continue;
    }
    const entry = state.oceanConditions[conditionId];
    const label = layerLabel(conditionId);
    setLayerButton(button, label, state.activeConditionId === conditionId);
    const badge = document.createElement("span");
    badge.className = "availability-badge";
    badge.textContent = entry?.available ? msg("Available") : msg("No data");
    button.append(badge);
    const roadmap = document.querySelector(`.roadmap-list [data-i18n="layers.${conditionId}"]`);
    if (roadmap) {
      roadmap.dataset.availability = entry?.available ? msg("Available") : msg("No data");
      roadmap.classList.toggle("is-live", Boolean(entry?.available));
    }
    button.disabled = false;
    button.classList.toggle("is-disabled", false);
  }
}

function renderOceanRenderModes() {
  if (!oceanConditionRenderModeListEl) {
    return;
  }

  const modes = renderModeOptions();
  if (modes.length === 0) {
    oceanConditionRenderModeListEl.hidden = true;
    oceanConditionRenderModeListEl.innerHTML = "";
    return;
  }

  oceanConditionRenderModeListEl.hidden = !state.mapReady;
  oceanConditionRenderModeListEl.innerHTML = modes
    .map(
      (mode) => `
        <button class="infrastructure-category-toggle${activeRenderModeId() === mode.id ? " is-selected" : ""}" type="button" data-render-mode="${mode.id}">
          <span class="infrastructure-category-main">
            <span class="layer-tick">${activeRenderModeId() === mode.id ? "✓" : ""}</span>
            <span>${msg(mode.label)}</span>
          </span>
          <span class="infrastructure-category-meta">${state.activeConditionId === "currents" ? msg("Current field") : msg("Wave field")}</span>
        </button>
      `
    )
    .join("");
  const motion = document.createElement("button");
  motion.type = "button";
  motion.id = "flow-motion-toggle";
  motion.className = "ghost-button";
  const paused = flowPaused();
  motion.textContent = msg(paused ? "Play animation" : "Pause animation");
  motion.setAttribute("aria-pressed", String(!paused));
  motion.hidden = activeRenderModeId() === "arrows";
  motion.addEventListener("click", () => {
    state.motionPaused = !flowPaused();
    renderOceanRenderModes();
    syncFlowAnimation();
    document.getElementById("flow-motion-toggle")?.focus();
  });
  const note = document.createElement("p");
  note.className = "scale-note";
  note.textContent = msg("Motion shows direction at the selected time; animation speed is illustrative. It does not advance the timeline.");
  oceanConditionRenderModeListEl.append(motion, note);
  oceanConditionRenderModeListEl.querySelectorAll("[data-render-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.oceanRenderModes[state.activeConditionId] = button.dataset.renderMode;
      renderOceanRenderModes();
      updateOverlayFrame();
    });
  });
}

function updateLayerToggleUi() {
  updateOceanConditionButtons();
  renderOceanRenderModes();
  updateNoiseUi();
  updateInfrastructureUi();
  updateStatusForVisibleLayers();
  updateChrome();
}



function setActiveOceanCondition(conditionId) {
  const entry = state.oceanConditions[conditionId];
  if (!entry?.condition) {
    setStatus(msg("{layer} is not configured in the current manifest.", {layer:layerLabel(conditionId)}), "warning");
    return;
  }

  if (state.activeConditionId === conditionId) {
    state.requestedTimeUtc = currentFrame()?.time_utc ?? state.requestedTimeUtc;
    state.activeConditionId = null;
    updateOverlayFrame();
    clickPanelEl.hidden = true;
    updatePaletteButtons();
    updateLayerToggleUi();
    setOceanVisibility();
    updateChrome();
    updateTransparencyPanel();
    renderActiveOverlayControls();
    updateOverlayDependentPanels();
    return;
  }

  const previousFrame = currentFrame();
  state.activeConditionId = conditionId;
  if (entry.metadata) {
    state.metadata = entry.metadata;
    state.activeFrameIndex = nearestFrameIndexForTimestamp(entry.metadata, state.requestedTimeUtc || previousFrame?.time_utc);

  }
  syncTimelineUi();
  updatePaletteButtons();
  updateLayerToggleUi();
  renderActiveOverlayControls();
  setOceanVisibility();
  updateChrome();
  updateTransparencyPanel();
  updateOverlayFrame();
}

function toggleTemperatureLayer() {
  setActiveOceanCondition("temperature");
}

function toggleLabelsLayer() {
  state.labelsVisible = !state.labelsVisible;
  updateViewToggle();
  if (state.map && activeConditionMetadata()) {
    applyNightMode(currentFrame());
  }
}

function setPalette(paletteName) {
  if (!TEMPERATURE_PALETTES[paletteName]) return;
  state.paletteOverrides[state.activeConditionId] = paletteName;
  updatePaletteButtons();
  closePaletteMenu();
  updateOverlayFrame();
}

async function setSelectedLocation(latitude, longitude) {
  state.selectedLocation = {
    latitude,
    longitude,
    sampleText: null
  };
  setSelectedLocationMarker();
  await updateSelectedLocationValues();
}

async function updateSelectedLocationValues(selection = selectionSnapshot()) {
  const requestToken = ++state.selectedLocationRequestToken;
  const location = state.selectedLocation;
  if (!location || !selection.metadata || !oceanLayerVisible() || !state.mapReady) {clickPanelEl.hidden = true; return;}
  location.sampleText = null;
  clickPanelEl.hidden = true;
  updateChrome();
  try {
    const sample = await fetchOceanSample(location.latitude, location.longitude, selection);
    if (requestToken !== state.selectedLocationRequestToken || location !== state.selectedLocation || !selectionIsCurrent(selection)) return;
    const value = sample.primary_value;
    location.sampleText = typeof value === "number" ? `${value.toFixed(2)} ${readableUnit(sample.primary_unit)}${Number.isFinite(sample.bottom_depth_m) ? msg(" at {depth} m model depth (selected cell)", {depth:sample.bottom_depth_m.toFixed(1)}) : ""}` : msg("No valid water value at this location");
    clickedPrimaryValueEl.textContent = location.sampleText;
    clickedLayerNameEl.textContent = layerLabel(selection.conditionId);
    clickedTimeEl.textContent = formatTimestamp(sample.time_utc);
    clickedCoordinatesEl.textContent = `${formatCoordinate(location.latitude, "N", "S")} · ${formatCoordinate(location.longitude, "E", "W")}`;
    clickPanelEl.hidden = state.mode !== "map";
  } catch (error) {
    if (!selectionIsCurrent(selection) || requestToken !== state.selectedLocationRequestToken) return;
    console.error(error);
    location.sampleText = msg("Value unavailable for this frame");
  }
  renderActiveOverlayControls();
  updateChrome();
}

async function handleMapClick(event) {
  if (state.mode === "home") {
    setMode("map");
    clickPanelEl.hidden = true;
    return;
  }

  const noiseLayers = noiseInteractiveLayers();
  if (noiseLayers.length > 0 && state.map.queryRenderedFeatures(event.point, { layers: noiseLayers }).length > 0) {
    return;
  }

  const interactiveLayers = infrastructureInteractiveLayers();
  if (interactiveLayers.length > 0 && state.map.queryRenderedFeatures(event.point, { layers: interactiveLayers }).length > 0) {
    return;
  }

  if (!oceanLayerVisible()) {
    clickPanelEl.hidden = true;
    return;
  }

  const { lat, lng } = event.lngLat;
  await setSelectedLocation(lat, lng);
}

function registerInteractions(maplibregl) {
  if (state.map.__interactionsRegistered) {
    return;
  }
  state.map.__interactionsRegistered = true;

  state.map.scrollZoom.enable();
  state.map.dragPan.enable();
  state.map.touchZoomRotate.enable();
  state.map.doubleClickZoom.enable();
  state.map.keyboard.enable();
  if (state.map.touchPitch && typeof state.map.touchPitch.enable === "function") {
    state.map.touchPitch.enable();
  }

  state.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  state.map.on("click", (event) => {
    handleMapClick(event).catch((error) => {
      console.error(error);
    });
  });

  state.map.on("moveend", () => {
    refreshOceanVisuals().catch((error) => {
      console.error(error);
    });
  });

  state.map.on("resize", () => {
    refreshOceanVisuals().catch(console.error);
  });

  state.map.on("zoomend", () => {
    refreshOceanVisuals().catch((error) => {
      console.error(error);
    });
  });
}

function initializeMapUi() {
  if (state.mapReady || state.mapFailed) return;
  state.mapReady = true;
  localizeMapControls();
  document.getElementById("map-fallback").hidden = true;
  bodyEl.dataset.mapState = "ready";
  addOceanLayers();
  ensureSelectedLocationLayer();
  registerInteractions(state.maplibregl);
  state.map.getCanvas().addEventListener("webglcontextlost", event => {event.preventDefault(); failMap(new Error("WebGL context lost"));}, {once:true});
  syncPanelAccess();
  updateOverlayFrame();
  updateLayerToggleUi();
  updateViewToggle();
  updateFallbackAppearance();
  setSelectedLocationMarker();
}

async function loadMapLibre() {
  if (window.maplibregl) return window.maplibregl;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {script.remove(); reject(new Error("MapLibre load timed out"));}, 12000);
    script.src = MAPLIBRE_JS_URL;
    script.async = true;
    script.onload = () => {window.clearTimeout(timeout); resolve();};
    script.onerror = () => {window.clearTimeout(timeout); reject(new Error("MapLibre could not be loaded"));};
    document.head.appendChild(script);
  });
  if (!window.maplibregl?.Map) throw new Error("MapLibre renderer unavailable");
  return window.maplibregl;
}

function bindUi() {
  timeSliderEl.addEventListener("input", () => {
    state.activeFrameIndex = Number(timeSliderEl.value);
    state.requestedTimeUtc = currentFrame()?.time_utc ?? null;
    updateOverlayFrame();
  });
  document.getElementById("layers-drawer-toggle").addEventListener("click", () => {
    state.drawerOpen = !state.drawerOpen;
    state.overlayInfoId = null;
    renderOverlayInfoPanel();
    syncPanelAccess();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!paletteMenuEl.hidden) {closePaletteMenu(); paletteButtonEl.focus();}
    else if (!languageMenuEl.hidden) {closeLanguageMenu(); languageButtonEl.focus();}
    else if (state.overlayInfoId) closeOverlayGuide();
    else if (state.drawerOpen) {state.drawerOpen = false; syncPanelAccess(); document.getElementById("layers-drawer-toggle").focus();}
  });
  heroEnterMapEl.addEventListener("click", () => setMode("map"));
  topEnterMapEl.addEventListener("click", () => setMode("map"));
  previewEnterMapEl.addEventListener("click", () => setMode("map"));
  exitMapEl.addEventListener("click", () => setMode("home"));
  temperatureToggleEl.addEventListener("click", toggleTemperatureLayer);
  currentsToggleEl?.addEventListener("click", () => setActiveOceanCondition("currents"));
  salinityToggleEl?.addEventListener("click", () => setActiveOceanCondition("salinity"));
  oxygenToggleEl?.addEventListener("click", () => setActiveOceanCondition("oxygen"));
  wavesToggleEl?.addEventListener("click", () => setActiveOceanCondition("waves"));
  seaLevelToggleEl?.addEventListener("click", () => setActiveOceanCondition("seaLevel"));
  noiseToggleEl?.addEventListener("click", toggleNoiseOverlay);
  infrastructureToggleEl?.addEventListener("click", () => {
    toggleInfrastructureOverlay().catch((error) => {
      console.error(error);
      setStatus(msg("The infrastructure overlay could not be loaded. You can still read its guide."), "error");
    });
  });
  viewToggleEl.addEventListener("click", toggleLabelsLayer);
  paletteOptionEls.forEach((button) => {
    button.addEventListener("click", () => {
      setPalette(button.dataset.palette);
    });
  });
  document.getElementById("map-stage").addEventListener("click", (event) => {
    if (event.target.closest("button, a, #map-toolbar, #map-sidebar-shell, #map-bottom-left")) return;
    if (state.mode === "home") {
      setMode("map");
    }
  });
  controlCardToggleEls.forEach((toggleEl) => {
    toggleEl.addEventListener("click", () => {
      toggleControlCard(toggleEl.dataset.controlCardToggle);
    });
  });
  overlayInfoButtonEls.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleOverlayInfoPanel(button.dataset.overlayInfoButton);
    });
  });
  overlayInfoCloseEl?.addEventListener("click", () => {
    closeOverlayGuide();
  });
  window.addEventListener("resize", () => {
    syncPanelAccess();
    renderActiveOverlayControls();
    renderOverlayInfoPanel();
  });
}

function syncTimelineUi() {
  const metadata = activeConditionMetadata();
  timeSliderEl.disabled = !metadata?.frames?.length;
  timeSliderEl.setAttribute("aria-valuetext", formatTimestamp(currentFrame()?.time_utc));
  if (!metadata?.frames?.length) {
    timeSliderEl.min = "0";
    timeSliderEl.max = "0";
    timeSliderEl.step = "1";
    timeSliderEl.value = "0";
    return;
  }
  timeSliderEl.min = "0";
  timeSliderEl.max = String(metadata.frames.length - 1);
  timeSliderEl.step = "1";
  timeSliderEl.value = String(state.activeFrameIndex);
}

async function bootstrap() {
  bindUi(); bindLanguageMenu(); bindPaletteMenu(); syncPanelAccess();
  try {await loadTranslations("en"); applyTranslations();} catch (error) {console.error(error);}
  try {
    state.oceanManifest = await readStaticJson(OCEAN_MANIFEST_URL);
    state.oceanConditions = Object.fromEntries((state.oceanManifest.conditions || []).map(entry => {
      const definition = entry.metadata?.condition || entry.condition;
      const condition = {...definition, units: readableUnit(definition?.units)};
      if (entry.id === "oxygen" && String(condition.depth_mode).startsWith("surface")) condition.label = msg("Surface dissolved oxygen");
      return [entry.id, {...entry, condition}];
    }));
    state.activeConditionId = state.oceanManifest.default_condition_id || "temperature";
    state.metadata = activeConditionMetadata();
    state.activeFrameIndex = nearestFrameIndexForTimestamp(state.metadata, null);
    state.requestedTimeUtc = currentFrame()?.time_utc ?? null;
  } catch (error) {
    console.error(error);
    setStatus(msg("Published ocean data could not be loaded. The overview and layer guides are still available."), "warning");
  }
  updateLayerToggleUi(); updatePaletteButtons(); updateOverlayFrame();
  ensureInfrastructureManifest().then(() => updateTransparencyPanel()).catch(error => console.error(error));
  try {
    state.maplibregl = await loadMapLibre();
    const region = state.metadata?.region || state.oceanManifest?.region;
    state.map = new state.maplibregl.Map({
      container: mapContainerEl, style: mapStyle(),
      center: region?.initial_view?.center || [20, 59.5], zoom: region?.initial_view?.zoom || 4.5,
      pitch: 42, bearing: 18, maxPitch: 76, minZoom: 2.4, maxZoom: 18.5,
      attributionControl: true, dragRotate: true, pitchWithRotate: true
    });
    state.map.on("load", () => {try {initializeMapUi();} catch (error) {failMap(error);}});
    // A single bounded initialization check; never a retry loop.
    window.setTimeout(() => {
      if (state.mapFailed || state.mapReady) return;
      try {
        if (state.map?.isStyleLoaded()) initializeMapUi();
        else failMap(new Error("Map style initialization timed out"));
      } catch (error) {failMap(error);}
    }, 12000);
    state.map.on("sourcedata", event => {
      if (!state.mapFailed && event.sourceId === "eox-satellite" && event.isSourceLoaded) {state.satelliteWorking = true; updateFallbackAppearance();}
    });
    state.map.on("error", event => {
      console.error("Map resource error", event.error);
      if (state.mapFailed) return;
      const message = String(event.error?.message || "");
      if (/webgl|context lost/i.test(message)) failMap(event.error);
      else if (/helcom/i.test(message + event.error?.url)) setStatus(msg("A noise layer could not be loaded. Its historical guide is still available."), "warning");
      else {state.satelliteWorking = false; updateFallbackAppearance();}
    });
  } catch (error) {failMap(error);}
}

function selectionSnapshot() {
  return {conditionId: state.activeConditionId, condition: activeConditionDefinition(), metadata: activeConditionMetadata(), frame: currentFrame(), frameIndex: state.activeFrameIndex, version: state.selectionVersion};
}

function selectionIsCurrent(selection) {
  return selection.version === state.selectionVersion && selection.conditionId === state.activeConditionId && selection.frameIndex === state.activeFrameIndex;
}

async function readStaticJson(relativeUrl) {
  const url = new URL(relativeUrl, window.location.href).toString();
  if (state.pendingData.has(url)) return state.pendingData.get(url);
  const pending = (async () => {
    const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`Static file unavailable (${response.status}): ${url}`);
    return response.json();
  })();
  state.pendingData.set(url, pending);
  try {return await pending;} finally {state.pendingData.delete(url);}
}

function clearOceanVisuals() {
  state.flowFeatures = [];
  stopFlowAnimation();
  state.renderWaitCancel?.();
  state.renderedSelectionVersion = null;
  delete mapContainerEl.dataset.frame;
  delete mapContainerEl.dataset.condition;
  if (!state.mapReady) return;
  updateOceanLayerStyles();
  for (const id of ["ocean-scalar-source", "ocean-shoreline-source", "ocean-vector-source"]) setGeoJsonSourceData(id, emptyFeatureCollection());
}

function waitForOceanSources(map, selection, token) {
  state.renderWaitCancel?.();
  return new Promise((resolve, reject) => {
    const finish = (ready, error) => {
      window.clearTimeout(timeout);
      map.off("sourcedata", check);
      if (state.renderWaitCancel === cancel) state.renderWaitCancel = null;
      if (error) reject(error); else resolve(ready);
    };
    const cancel = () => finish(false);
    const check = () => {
      if (!selectionIsCurrent(selection) || token !== state.oceanVisuals.requestToken || !state.mapReady) return finish(false);
      if (["ocean-scalar-source", "ocean-shoreline-source", "ocean-vector-source"].every(id => map.isSourceLoaded(id))) finish(true);
    };
    const timeout = window.setTimeout(() => finish(false, new Error("Ocean source rendering timed out")), 15000);
    state.renderWaitCancel = cancel;
    map.on("sourcedata", check);
    check();
  });
}

function syncPanelAccess() {
  const mapMode = state.mode === "map", compact = isCompactControlLayout();
  const drawer = compact && state.drawerOpen;
  bodyEl.dataset.drawer = drawer ? "open" : "closed";
  bodyEl.dataset.guide = state.overlayInfoId ? "open" : "closed";
  document.getElementById("home-column").inert = mapMode;
  document.getElementById("map-toolbar").hidden = !mapMode;
  const sidebar = document.getElementById("map-left-sidebar");
  sidebar.inert = !mapMode || (compact && (!drawer || Boolean(state.overlayInfoId)));
  document.getElementById("map-sidebar-shell").inert = !mapMode || (compact && !drawer);
  mapBottomLeftEl.inert = !mapMode || drawer;
  mapContainerEl.inert = !mapMode || !state.mapReady;
  const toggle = document.getElementById("layers-drawer-toggle");
  toggle.setAttribute("aria-expanded", String(drawer));
  toggle.textContent = drawer ? msg("Close layers") : msg("Layers & info");
  viewToggleEl.disabled = !state.mapReady;
  noiseToggleEl.disabled = !state.mapReady;
  infrastructureToggleEl.disabled = !state.mapReady;
  document.getElementById("map-control-note").hidden = state.mapReady;
}

function closeOverlayGuide() {
  const id = state.overlayInfoId;
  state.overlayInfoId = null;
  renderOverlayInfoPanel();
  syncPanelAccess();
  overlayInfoButtonEls.find(button => button.dataset.overlayInfoButton === id)?.focus();
}

function failMap(error) {
  stopFlowAnimation();
  console.error("Interactive map unavailable", error);
  if (state.mapFailed) return;
  state.mapFailed = true;
  state.renderWaitCancel?.();
  state.mapReady = false;
  state.selectionVersion++;
  state.oceanVisuals.requestToken++;
  state.selectedLocationRequestToken++;
  state.frameStatus = "idle";
  const failedMap = state.map;
  state.map = null;
  try {failedMap?.remove();} catch (cleanupError) {console.error(cleanupError);}
  bodyEl.dataset.mapState = "unavailable";
  document.getElementById("map-fallback").hidden = false;
  renderMapFailureText();
  const preview = document.getElementById("fallback-coastline");
  const url = activeConditionMetadata()?.fallback?.land_mask_url;
  if (url) {preview.src = url; preview.hidden = false; preview.onerror = () => {preview.hidden = true;};}
  syncPanelAccess();
  updateChrome();
  updateStatusForVisibleLayers();
}

function updateDataSummary() {
  const metadata = activeConditionMetadata();
  document.getElementById("home-data-update").textContent = metadata
    ? msg("{layer} dataset last successful update: {updated}. Selected data time: {selected}.", {layer:activeConditionDefinition()?.label,updated:formatTimestamp(metadata.provenance?.retrieved_at_utc),selected:formatTimestamp(currentFrame()?.time_utc)})
    : msg("Published dataset details are currently unavailable.");
  document.getElementById("home-forecast-status").textContent = forecastArchived(metadata) ? msg("Archived forecast — not current conditions.") : "";
}

function metadataRow(root, label, value, href) {
  const row = document.createElement("p");
  const name = document.createElement("strong");
  name.textContent = `${msg(label)}: `;
  row.append(name);
  if (href) {
    const link = document.createElement("a");
    link.textContent = msg(value);
    const url = new URL(href, window.location.href);
    if (["https:", "http:"].includes(url.protocol)) link.href = url.href;
    row.append(link);
  } else row.append(document.createTextNode(msg(value) || msg("Not recorded in the published metadata")));
  root.append(row);
}

function appendLayerMetadata(root, id) {
  const entry = state.oceanConditions[id], metadata = entry?.metadata, condition = entry?.condition;
  if (condition) {
    const provenance = metadata?.provenance || {};
    const product = provenance.product_id || condition.product_id;
    const frame = id === state.activeConditionId ? currentFrame() : metadata?.frames?.[nearestFrameIndexForTimestamp(metadata, state.requestedTimeUtc)];
    metadataRow(root, "Source", provenance.source || "Copernicus Marine", product ? `https://data.marine.copernicus.eu/product/${encodeURIComponent(product)}/description` : "https://marine.copernicus.eu/");
    metadataRow(root, "Status", provenance.type || condition.dataset_type);
    metadataRow(root, msg("Selected data timestamp (UTC)"), frame ? formatTimestamp(frame.time_utc) : msg("No published frames"));
    metadataRow(root, msg("Dataset last successful update (retrieval / processing)"), formatTimestamp(provenance.retrieved_at_utc));
    if (metadata) metadataRow(root, msg("Update note"), msg("This is the dataset export’s recorded retrieval / processing time, not the selected model time or a separate download time for every retained frame."));
    metadataRow(root, msg("Product"), product);
    metadataRow(root, msg("Dataset"), provenance.dataset_id || condition.dataset_id);
    const surface = String(condition.depth_mode).startsWith("surface");
    metadataRow(root, msg("Vertical level"), metadata?.depth_label || (surface ? (id === "waves" || id === "seaLevel" ? msg("Sea surface") : msg("Shallowest model level (surface); exact depth in metres not recorded")) : msg("Not recorded in published metadata")));
    const q = state.oceanQueryIndices[id];
    metadataRow(root, msg("Published spatial grid"), q ? msg("{rows} × {cols} cells; approximately {lat}° latitude × {lon}° longitude spacing", {rows:q.latitudes.length,cols:q.longitudes.length,lat:Math.abs(q.latitudes[1]-q.latitudes[0]).toFixed(5),lon:Math.abs(q.longitudes[1]-q.longitudes[0]).toFixed(5)}) : msg("Grid coordinates accompany the published query index; exact grid not loaded for this layer."));
    metadataRow(root, msg("Source time resolution"), msg(condition.time_resolution_label) + (id === "oxygen" ? msg(" means") : msg(" instantaneous values")));
    if (metadata) metadataRow(root, msg("Published time spacing"), intervalLabel(metadata));
    metadataRow(root, msg("Units"), readableUnit(condition.units));
    metadataRow(root, msg("Limitations"), msg("Model output, not direct observations. The map simplifies the grid by zoom level; location values are interpolated. Colour-scale bounds stay fixed across published times. Missing or invalid cells are excluded."));
    if (id === "oxygen") {
      if (condition.depth_mode === "bottom") {
        metadataRow(root, msg("Bottom oxygen"), msg("Deepest non-missing value per model water column; depth varies by location. A cell value and model depth are shown when sampled. Daily means; the palette is not a hypoxia classification."));
        if (frame?.bottom_depth_range_m) metadataRow(root, msg("Frame model depth range"), `${frame.bottom_depth_range_m.min}–${frame.bottom_depth_range_m.max} m`);
      } else metadataRow(root, msg("Surface oxygen only"), msg("These existing files do not represent bottom-water hypoxia. Bottom extraction is configured for the next manually triggered update. The sequential palette shows relative concentration, not hypoxia categories; each timestamp represents a daily mean."));
    }
    if (id === "seaLevel") metadataRow(root, msg("Reference level"), msg("The vertical datum is not recorded in this export. Do not interpret these values as a local flood threshold."));
    if (forecastArchived(metadata)) metadataRow(root, msg("Forecast window"), msg("Archived forecast — not current conditions."));
    return;
  }
  if (id === "noise") {
    metadataRow(root, "Status", msg("Historical modelled assessment pressure and reported activity events, 2016–2021"));
    metadataRow(root, msg("Data timestamp"), msg("Assessment period 2016–2021; continuous noise uses representative model year 2018. Independent of the ocean timeline."));
    metadataRow(root, msg("Dataset update time"), msg("Not recorded in the supplied assessment metadata"));
    metadataRow(root, msg("Vertical / spatial resolution"), msg("Not specified in the supplied layer metadata; not a depth-resolved microphone measurement."));
    for (const category of NOISE_CATEGORY_ORDER.filter(key => !state.noise.active || state.noise.categories[key])) {
      const layer = NOISE_LAYER_DEFINITIONS[category];
      const url = layer.pointsUrl ? layer.pointsUrl.split("/query")[0] : layer.tiles[0].split("/export")[0] + "/" + ({continuousNoise:201, impulsivePressure:202, ecologicalEffect:223})[category];
      metadataRow(root, layer.fallbackLabel, `${layer.source} · ${layer.units || msg("Reported event locations / areas")}`, url);
    }
    metadataRow(root, msg("Limitations"), msg("Pressure and impact indices are not sound levels in dB and must not be added together. Event coverage depends on national reporting."));
  } else if (id === "infrastructure") {
    const manifest = state.infrastructure.manifest;
    metadataRow(root, "Status", msg("Historical / static curated prototype references; approximate features, not a complete operational inventory."));
    metadataRow(root, msg("Dataset update"), manifest?.overlay?.updated_at ? manifest.overlay.updated_at + msg(" (date only; no time recorded)") : msg("Not recorded"));
    metadataRow(root, msg("Timestamp / resolution / vertical level"), msg("Static features, independent of the ocean timeline. Uniform spatial resolution and vertical level are not supplied."));
    for (const layer of manifest?.categories || []) {
      if (state.infrastructure.active && !state.infrastructure.categories[layer.id]) continue;
      metadataRow(root, layer.name, `${layer.source_name} · ${layer.license}`, layer.source_url);
    }
    metadataRow(root, msg("Units"), msg("Feature locations and areas; no shared numerical unit"));
    metadataRow(root, msg("Provenance and planned integrations"), msg("Current bundle notes"), "./infrastructure/README.md");
  } else metadataRow(root, "Data", msg("Published metadata unavailable. The educational guide remains accessible."));
}

bootstrap();

function renderMapFailureText() {
  document.getElementById("map-fallback-title").textContent = msg("The interactive map is unavailable");
  document.getElementById("map-fallback-message").textContent = msg("Your browser could not start or load the map. You can still explore layer guides, dataset details and published timestamps. Try a browser with WebGL enabled to use the interactive map.");
  document.getElementById("home-map-status").textContent = msg("Map unavailable in this browser. The layer guides, dataset details and timeline remain available.");
}

// Local presentation only: no data fetching, model updates or background animation.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let flowCanvas, flowContext, flowRequest = null, flowLastDraw = 0, flowElapsed = 0;
function flowPaused() { return state.motionPaused ?? reducedMotion.matches; }
function stopFlowAnimation() {
  if (flowRequest !== null) cancelAnimationFrame(flowRequest);
  flowRequest = null;
  flowLastDraw = 0;
  if (flowCanvas) {
    flowContext?.clearRect(0, 0, flowCanvas.width, flowCanvas.height);
    flowCanvas.hidden = true;
  }
}
function syncFlowAnimation() {
  stopFlowAnimation();
  const visible = state.mapReady && state.mode === "map" && !document.hidden && oceanVectorLayerVisible()
    && activeRenderModeId() !== "arrows" && state.renderedSelectionVersion === state.selectionVersion && state.flowFeatures?.length;
  if (!visible) return;
  if (!flowCanvas || !flowCanvas.isConnected) {
    flowCanvas = document.createElement("canvas");
    flowCanvas.id = "ocean-flow-animation";
    flowCanvas.setAttribute("aria-hidden", "true");
    mapContainerEl.append(flowCanvas);
    flowContext = flowCanvas.getContext("2d");
  }
  if (!flowContext) return;
  flowCanvas.hidden = false;
  flowCanvas.dataset.frame = currentFrame()?.time_utc || "";
  flowCanvas.dataset.condition = state.activeConditionId;
  drawFlowAnimation(performance.now());
}
function drawFlowAnimation(now) {
  flowRequest = null;
  if (!state.mapReady || state.mode !== "map" || document.hidden || state.renderedSelectionVersion !== state.selectionVersion) {stopFlowAnimation(); return;}
  if (!flowLastDraw || now - flowLastDraw >= 32) {
    if (!flowPaused() && flowLastDraw) flowElapsed += Math.min(now - flowLastDraw, 100);
    flowLastDraw = now;
    const width = mapContainerEl.clientWidth, height = mapContainerEl.clientHeight, ratio = Math.min(devicePixelRatio || 1, 2);
    if (flowCanvas.width !== Math.round(width*ratio) || flowCanvas.height !== Math.round(height*ratio)) {
      flowCanvas.width = Math.round(width*ratio); flowCanvas.height = Math.round(height*ratio);
    }
    const ctx = flowContext;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    let drawn = 0;
    state.flowFeatures.forEach((feature, index) => {
      const [start, end] = feature.geometry.coordinates.map(point => state.map.project(point));
      const length = Math.hypot(end.x-start.x, end.y-start.y);
      if (!Number.isFinite(length) || length < 0.1) return;
      const dx = (end.x-start.x)/length, dy = (end.y-start.y)/length;
      const phase = ((flowElapsed/2200 + index*0.618) % 1);
      const x = (start.x+end.x)/2 + (phase-0.5)*36*dx;
      const y = (start.y+end.y)/2 + (phase-0.5)*36*dy;
      if (x < -40 || y < -40 || x > width+40 || y > height+40) return;
      ctx.globalAlpha = 0.5 + 0.5*Math.sin(phase*Math.PI);
      ctx.beginPath();
      if (state.activeConditionId === "waves") {
        // A wave crest moves perpendicular to itself, in the published propagation direction.
        ctx.moveTo(x-dy*12, y+dx*12);
        ctx.quadraticCurveTo(x+dx*6, y+dy*6, x+dy*12, y-dx*12);
      } else {
        ctx.moveTo(x-dx*12, y-dy*12); ctx.lineTo(x+dx*5, y+dy*5);
      }
      ctx.strokeStyle = "#102d3e"; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = "#f4fcff"; ctx.lineWidth = 3; ctx.stroke();
      drawn++;
    });
    ctx.globalAlpha = 1;
    flowCanvas.dataset.drawn = String(drawn);
    flowCanvas.dataset.phase = String(flowElapsed);
  }
  if (!flowPaused()) flowRequest = requestAnimationFrame(drawFlowAnimation);
}
document.addEventListener("visibilitychange", syncFlowAnimation);
reducedMotion.addEventListener("change", () => {state.motionPaused = undefined; renderOceanRenderModes(); syncFlowAnimation();});

function localizeMapControls() {
  for (const [selector, label] of [[".maplibregl-ctrl-zoom-in", "Zoom in"], [".maplibregl-ctrl-zoom-out", "Zoom out"], [".maplibregl-ctrl-compass", "Reset north"]]) {
    const button = mapContainerEl.querySelector(selector);
    if (button) {button.title = msg(label); button.setAttribute("aria-label", msg(label));}
  }
}
