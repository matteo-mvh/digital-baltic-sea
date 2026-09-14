# Reliability, mobile usability and scientific clarity

Reviewed against the `digital-baltic-sea` repository and its published August 2026 archive on 14 September 2026. The older, uncommitted workspace repository was left untouched.

## What changed

- UTC timestamps distinguish the selected model frame from the dataset’s recorded retrieval / processing update. Homepage and timeline show manual-update and archive notices; available data remain browsable regardless of age.
- A bounded MapLibre initialization path handles CDN failure, unavailable WebGL, style initialization failure and context loss. The map area displays a friendly explanation and reuses the published coastline mask when available. Console diagnostics remain technical. There is no retry loop.
- Timeline events and metadata do not depend on the map. Requests capture layer, time and selection version. Old responses cannot replace a later selection; old geometry is hidden while new worker data load. Location persists across time and layer changes; layers use their nearest published timestamp.
- Scales use rounded dataset bounds without generic padding. Only nonnegative magnitudes/concentrations reject negative values; signed components, temperature and sea level remain signed. Invalid primary cells are excluded and reported, not clamped. The frame range and fixed colour scale are labelled separately. Oxygen defaults to a sequential low-to-high palette.
- Mobile layers use a collapsible sheet; the guide replaces the layer list inside the sheet. Timeline and sheet are never stacked on top of each other. Landscape uses a scrollable side panel. Back to overview remains outside the drawer. Hidden content is inert or removed from display; controls have accessible names, keyboard focus and larger tap targets.
- Source/product links, model/historical status, available vertical metadata, actual published time spacing, units and limitations are accessible in the sidebar and guides. Social metadata describes manually updated model and historical data.

## Oxygen depth

The published oxygen archive has `depth_mode: surface-ready-for-depth`. The old pipeline selected the shallowest depth and discarded its coordinate; these files cannot recover bottom oxygen or an exact surface depth in metres. They therefore remain labelled **Surface dissolved oxygen**.

Following the owner’s request, the next **manually triggered** update will read the full vertical column of the same `cmems_mod_bal_bgc_anfc_P1D-m` oxygen dataset and select the deepest non-missing value at every water column. It preserves `bottom_depth_m` per cell and a frame depth range. Zero is valid; invalid negative concentrations are not silently replaced with surface values. All-missing columns remain missing. A globally deepest horizontal slice is not used.

Surface frames cannot be carried into a bottom series. If a manual update fails, preserved surface data keep their original label and update time. The next full-column oxygen download will be larger than a surface-only download; the existing time window and resource configuration remain unchanged. No new product, service or hypoxia classification was introduced.

The [Copernicus biogeochemistry product](https://data.marine.copernicus.eu/product/BALTICSEA_ANALYSISFORECAST_BGC_003_007/description) identifies this dataset as daily model means. Source depth and resolution context can also be inspected through the [physics product](https://data.marine.copernicus.eu/product/BALTICSEA_ANALYSISFORECAST_PHY_003_006/description) and [wave product](https://data.marine.copernicus.eu/product/BALTICSEA_ANALYSISFORECAST_WAV_003_010/description). Displayed grid spacing is calculated from the published query-index coordinates, rather than assuming every product or exported interval is identical.

## Verification

- Reproduced the original frozen timestamp at 320, 375, 430, 768 and 1366 px; the 320–430 px bottom controls inherited `max-width: 0px`.
- Node unit tests cover ranges, invalid data, signed quantities, timezone formatting, nearest timestamps, archive detection and the manual-only workflow boundary.
- Python tests cover bottom selection with varying bathymetry, dry columns, zero values, unordered depths, invalid source values, surface-only rejection, metadata preservation and a completely offline static build. Metadata packaging is exercised with synthetic arrays; download-only imports are stubbed to prevent external calls.
- Playwright/Chrome tests cover CDN failure, blocked WebGL, missing manifest, missing/mismatched frames, invalid cells, homepage/map navigation, language menu, disabled options, keyboard slider/focus, guide focus return, infrastructure/noise controls, rapid time/layer changes, deselection and nearest daily oxygen time. Tests check both source geometry and rendered feature colours.
- Responsive browser checks: 320×780, 375×812, 430×932, 768×1024, 1366×900, 768×375 and 667×320. No page or sidebar horizontal overflow was observed; panels scroll within their allocated space.
- Real WebGL rendered cached published frames in Chrome. At the retained location 59.5° N, 20° E, the 20 August 2026 temperature changed from 17.91 °C at 04:00 UTC to 17.86 °C at 05:00 UTC. Switching to oxygen used the available 00:00 UTC daily frame, retained the location and preserved the surface label.

## Limits and operational boundary

Browser tests use desktop Chrome with resized viewports, not physical phones or Safari. External basemap and HELCOM requests were deliberately blocked in deterministic tests; the published coastline and local infrastructure assets were used. These checks do not establish third-party service uptime.

Bottom extraction was tested offline; no Copernicus download, data-update workflow or production bottom-data generation was run. The currently available files are still surface oxygen. Exact bottom depths will become available only after the owner manually updates the dataset.

**Automatic data updates remain disabled.** The data workflow still has only `workflow_dispatch` enabled. Website visits do not invoke workflows. No recurring jobs, new external services or billable infrastructure were added.
