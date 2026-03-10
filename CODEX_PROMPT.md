# Codex Build Prompt

Build a production-quality research website called **Evia Wildfire Timeline**.

## Objective

Create a minimal editorial web application for investigating the network of actors and processes around the 2021 Evia wildfire inside a longer timeline spanning **1970 to today**.

The interface must combine:

- a custom zoomable horizontal timeline,
- a synchronized map,
- and an event detail panel.

## Required stack

Use:

- **Astro** for the site shell
- **React + TypeScript** for interactive UI
- **D3** for the timeline
- **MapLibre GL JS** for the map
- **Keystatic** for content editing

Do not use a generic timeline plugin as the main solution.

## Visual direction

Design language should be restrained and publication-grade, inspired by:

- Forensic Architecture

That means:

- strong typography
- quiet palette
- minimal chrome
- analytical clarity
- no dashboard look
- no flashy motion

## Functional requirements

Implement:

1. Timeline from 1970 to today
2. Zoom from full-range view to year/month/day detail
3. Support for point and duration events
4. Category lanes or equivalent track logic
5. Event click selection
6. Detail panel with title, date, summary, long text, actors, places, sources, and image(s)
7. Synchronized map that fits to event geometry or fallback viewport
8. Filters for category, actor, place, date range, and tags
9. URL state for selected event and date/filter context where practical
10. Responsive layout

## Content requirements

Implement content collections for:

- events
- actors
- places
- pages

Use structured frontmatter and strict validation.

Create a build step that compiles content into optimized JSON / GeoJSON for the frontend.

## Editing requirements

The researcher must be able to add new events later without changing application code.

Use Keystatic to provide:

- collection editing
- image fields
- structured metadata
- Git-friendly content storage

## Data rules

Support:

- exact dates
- month-only dates
- year-only dates
- approximate dates
- durations
- open-ended / ongoing processes
- GeoJSON point/line/polygon annotations
- actor references
- place references
- source references

## Performance rules

- Keep most of the site static.
- Hydrate only the interactive timeline workspace.
- Lazy-load the map.
- Optimize images.
- Avoid dependency bloat.

## Accessibility rules

- keyboard navigable core interactions
- visible focus styles
- reduced-motion support
- no color-only encoding
- strong contrast

## Deliverables

Produce:

- full project scaffold
- seeded content examples
- polished timeline page
- synchronized map behavior
- working Keystatic config
- clear README for local development

## Implementation style

- keep code modular and readable
- use TypeScript throughout
- use small focused components
- keep styling elegant and restrained
- write helper utilities for date normalization and event layout
- fail fast on invalid content

## Important note

Treat Forensic Architecture Timemap and Bellingcat’s Ukraine TimeMap as conceptual references only. Do not fork old code blindly. Build a cleaner custom implementation for this project.
