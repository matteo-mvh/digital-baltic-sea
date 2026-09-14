# Digital Baltic Sea

> **Project type:** Personal Project  
> **Field:** Marine data science · ocean visualisation · web development · science communication  
> **Data:** Copernicus Marine · HELCOM · curated infrastructure references
> **Status:** Active development

## Overview

**Digital Baltic Sea** is an interactive web project designed to make Baltic Sea environmental data accessible and intuitive for non-specialists.

The project combines oceanographic data, vessel information and map-based visualisation into a public-facing digital representation of marine conditions.

The initial focus is on **Copenhagen and the Øresund**, with the longer-term goal of extending the concept across the Baltic Sea.

## Live Website

**Digital Baltic Sea:**  
[Digital Baltic Sea](https://matteo-mvh.github.io/digital-baltic-sea/)

## Motivation

Large amounts of high-quality oceanographic data are publicly available, but accessing and interpreting them often requires specialist tools and knowledge.

Digital Baltic Sea explores how those datasets can instead be presented through an intuitive web interface.

The project aims to bridge:

- ocean science
- environmental monitoring
- open marine data
- interactive visualisation
- public science communication

## Current Environmental Layers

The website architecture supports marine variables including:

- sea-surface temperature
- currents
- salinity
- dissolved oxygen
- waves
- sea level

The project also explores contextual layers such as:

- AIS vessel positions
- shipping activity
- modelled underwater shipping noise

## Data Sources

### Copernicus Marine

Oceanographic environmental data are primarily sourced from **Copernicus Marine** analysis and forecast products.

These are modelled ocean products rather than direct measurements at every displayed location.

Maintaining clear data provenance and communicating this distinction is an important part of the project.

Further information is available in:

```text
docs/data_sources.md
```

### AIS

AIS integration is planned. The current map uses HELCOM historical noise assessments and a curated infrastructure bundle; these are independent of the ocean timeline.

Vessel information can also be used as input for experimental shipping-noise visualisations.

## Website Concept

The project is designed as more than a conventional scientific data portal.

The interface combines:

- interactive maps
- marine environmental layers
- time-dependent data
- coastal context
- explanatory information
- science communication
- environmental storytelling

The goal is to allow users to explore **how the Baltic Sea changes through both space and time**.

## Repository Structure

```text
Digital-Baltic/
├── data/
├── data_pipeline/
├── docs/
├── frontend/
├── noise/
├── scripts/
├── site/
└── .github/
    └── workflows/
```

### `frontend/`

Source files for the interactive website interface.

### `data_pipeline/`

Scripts responsible for retrieving and preparing marine environmental data.

### `noise/`

Experimental modelling components related to vessel activity and underwater shipping noise.

### `scripts/`

Utilities for preparing and building the deployable website.

### `site/`

Generated static website used for deployment.

### `.github/workflows/`

GitHub Actions workflows used for manually triggered data updates and website deployment.

## Manual Data Updates

Data are updated manually in this prototype. `.github/workflows/update-ocean-data.yml` only runs through `workflow_dispatch`; its schedule remains commented out. Website visits never trigger it, and the frontend has no update endpoint, background refresh job or paid service.

The ordinary deployment workflow builds static website files and reuses already-published processed assets. It does not contact Copernicus or generate new ocean data. Archive age is presented as scientific context, not an application error. All displayed timestamps use UTC; selected model time is separate from the recorded dataset retrieval / processing time.

The next owner-triggered update will extract **bottom dissolved oxygen** from the existing daily Copernicus oxygen product: the deepest non-missing model value at each location, with its model depth retained. This requires the full vertical column for each daily frame, so that manual run transfers more oxygen data than the previous surface-only selection. Existing disk/RAM configuration and the daily time window remain unchanged. No new product or service is used.

Existing published oxygen files contain only surface values and remain labelled **Surface dissolved oxygen** until bottom data are manually published. Surface frames cannot be carried into a bottom series. If a manual update fails, retained files keep their original vertical selection and retrieval time. A colour scale is not a hypoxia classification.

## Hosting

The website is deployed using **GitHub Pages**.

GitHub Actions build and deploy the site. Ocean data refresh is strictly manual.

Relevant workflows include:

```text
.github/workflows/deploy-site.yml
.github/workflows/update-ocean-data.yml
```

## Planned Development

The longer-term concept includes additional Baltic Sea information such as:

- biodiversity
- oxygen conditions
- eutrophication
- contaminants
- underwater noise
- maritime traffic
- coastal habitats
- additional physical ocean variables
- multilingual science communication

The platform is intended to gradually expand as new datasets and visualisations are integrated.

## What This Project Demonstrates

Digital Baltic Sea combines several technical and scientific areas:

- marine data science
- Copernicus Marine data
- geospatial environmental data
- manually operated data processing
- web development
- interactive mapping
- GitHub Actions
- GitHub Pages deployment
- AIS data
- environmental visualisation
- science communication

## Project Status

**Active personal project.**

The platform is under ongoing development, so individual layers and features may change as new datasets and functionality are added.

## Local verification

Run `node --test tests/ocean-data.test.mjs` and `python -m unittest discover -s tests -p "test_*.py"` (NumPy, pandas and Pillow required for offline pipeline tests). No ocean downloads occur in these tests.

`tests/browser.cjs` uses Playwright and an installed Chrome browser. Supply the existing MapLibre 5.6.2 JS/CSS files in `.review/`, or point `REVIEW_ASSETS` to a folder containing them. With Playwright on the Node module path, run `node tests/browser.cjs`. The test server serves synthetic fixtures and blocks external requests. Screenshots are written to `.review/screenshots/`. No test runs an update workflow.

See [the verification notes](docs/reliability-review.md) for the checks and limitations.
