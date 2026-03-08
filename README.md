# Evia Wildfire Timeline

Publication-grade investigative website for researching actors, decisions, and processes around the 2021 Evia wildfire within a 1970-today timeline.

## Stack

- Astro for static shell and routes
- React + TypeScript for interactive workspace
- D3 for custom timeline engine
- MapLibre GL JS for synchronized map
- Keystatic for Git-backed editorial entry
- Zod + build scripts for strict content validation

## Current scope

Implemented through Phase 7:

- D3 timeline with zoom/pan, category lanes, point/duration events
- Detail panel with actors, places, sources, and media
- Lazy-loaded MapLibre panel synchronized to selection
- Filters for category, actor, place, tags, and date range
- URL query state for selection and filters
- Reset + stable empty states
- Hardened Keystatic field guidance and validation constraints
- Responsive, accessibility, and performance-oriented refinements

## Local development

Requirements:

- Node.js 20+
- npm

Install and run:

```bash
npm install
npm run build:data
npm run dev
```

Timeline workspace:

- `http://localhost:4321/timeline`

Keystatic editor (local mode):

- `http://localhost:4321/keystatic`

## Scripts

- `npm run dev`: Astro dev server
- `npm run build:data`: compile content to `public/data/*`
- `npm run validate:content`: validate content/references only
- `npm run typecheck`: Astro/TypeScript check
- `npm run lint`: ESLint
- `npm run build`: data compile + validation + Astro production build
- `npm run preview`: preview production output

## Data and editing model

Authoring source:

- `src/content/events`
- `src/content/actors`
- `src/content/places`
- `src/content/pages`
- `src/references/sources.json`
- `src/references/media.json`

Compiled artifacts:

- `public/data/events.index.json`
- `public/data/events.geojson`
- `public/data/events.by-year/*.json`
- `public/data/actors.json`
- `public/data/places.json`
- `public/data/sources.json`
- `public/data/media.json`

The app reads compiled artifacts, not raw markdown, at runtime.

## URL state

Supported timeline query parameters:

- `event`
- `category`
- `actors`
- `places`
- `tags`
- `from`
- `to`

Example:

`/timeline?event=evia-2021-wildfire-front-duration&category=wildfire&actors=actor-hellenic-fire-service&from=2021-08-01&to=2021-08-31`

## Editorial instructions

Detailed non-developer editing workflow:

- [EDITING.md](./EDITING.md)

Canonical product/editorial references:

- `PROJECT_BRIEF.md`
- `PRODUCT_SPEC.md`
- `TECH_ARCHITECTURE.md`
- `DATA_MODEL.md`
- `DESIGN_SYSTEM.md`
- `EDITORIAL_WORKFLOW.md`

## Quality gate

Run before committing:

```bash
npm run build:data
npm run validate:content
npm run typecheck
npm run lint
npm run build
```
