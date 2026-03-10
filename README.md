# Evia Meta Reconstruction — Codex Pack

This pack is the implementation brief for a focused data-visualization module inside the broader Evia Wildfire Timeline website.

## Goal

Build a compact, publication-grade module that analyzes the post-fire reconstruction projects listed on the Evia Meta panorama site and in the workbook `EviaMeta_Works.xlsx`.

The module should do three things well:

1. **Audit the programme**
   - searchable / sortable evidence table
   - clear raw fields
   - explicit uncertainty

2. **Reveal temporal accountability**
   - step-based published-horizon timeline
   - clear distinction between completed, overdue, ongoing, and undated projects
   - no invented start dates

3. **Reveal structural patterns**
   - budget by category, with include/exclude mega-project toggle
   - funding provenance by category

## Required outputs

### Website route
A scrollytelling route that combines narrative text and the visuals.

Recommended route:
- `/reconstruction`

### Presentation route
A classroom-friendly presentation view using the same components and same data.

Recommended route:
- `/presentation/reconstruction`

## Primary visual package

1. Audit table
2. Published-horizon timeline with discrete steps
3. Budget by category
4. Funding provenance by category

## Files in this pack

- `AGENTS.md`
- `MODULE_BRIEF.md`
- `DATA_AUDIT.md`
- `DATA_INGESTION_SPEC.md`
- `VISUALIZATION_SPEC.md`
- `IMPLEMENTATION_PLAN.md`
- `CODEX_WORKFLOW.md`
- `SOURCES_AND_REFERENCES.md`
- `.codex/config.toml`
- `prompts/*.md`

## Implementation strategy

Use a build-time pipeline:

`raw xlsx -> normalize -> derive -> generated json -> React/D3 charts`

The UI must read generated JSON only.

## Why this approach

- minimal runtime weight
- stable diffs in Git
- easy manual correction
- easy reuse in website and presentation modes
- good fit for Astro islands
