# Project Memory — Evia Wildfire Timeline

## Project identity
- **Name**: Evia Wildfire Timeline (+ Evia Meta Reconstruction Module)
- **Purpose**: OSINT research website mapping history and actor network around 2021 Evia wildfire. Includes a separate data module analyzing the post-fire reconstruction programme from evoia-meta.gov.gr.
- **Stack**: Astro (shell) + React/TypeScript (interactive islands) + D3 (charts) + SVG (rendering). No chart wrapper libs.

## Key routes
- `/` — landing
- `/timeline` — main wildfire timeline (D3Timeline, not yet fully built)
- `/reconstruction` — scrollytelling reconstruction module (DONE phases 0–5+)
- `/presentation/reconstruction` — classroom presentation deck (DONE)
- `/about`, `/sources` — editorial pages

## Data pipeline (Evia Meta module)
- Source: `data/raw/EviaMeta_Works_update02.xlsx` (preferred), fallback to update01/original
- Sheet: `Works_EN`, 77 projects
- Script: `scripts/ingest-evoia-meta.ts` (run with tsx/ts-node)
- Outputs: `data/generated/evoia-meta-projects.json` + `evoia-meta-summary.json`
- Overrides: `data/overrides/evoia-meta-overrides.json`
- Pipeline: parse → applyOverrides → derive → validate → write JSON
- Frontend reads only generated JSON (never the workbook)

## Key lib files (evoia-meta)
- `src/lib/evoia-meta/schema.ts` — Zod schemas + TypeScript types
- `src/lib/evoia-meta/parse.ts` — XLSX row parsing, override application
- `src/lib/evoia-meta/derive.ts` — fundingProvenance, indicativeEnd, timelineStatus, isMegaProject
- `src/lib/evoia-meta/selectors.ts` — selectBudgetByCategory, selectFundingProvenanceByCategory, buildEvoiaMetaSummary
- `src/lib/evoia-meta/format.ts` — formatEuro, formatPercent, fundingProvenanceColors/labels/order
- `src/lib/evoia-meta/data.ts` — imports and validates generated JSON at module load
- `src/lib/evoia-meta/presentation-constants.ts` — CATEGORY_ORDER, FUNDING_GROUP_ORDER, colors, fonts, TRANSITION_MS
- `src/lib/evoia-meta/presentation-layout.ts` — computeSlide1/2/6Layout, computeSlideLayout (6 slides total)

## Key components (evoia-meta)
- `HorizonTimeline.tsx` — 5-step SVG timeline (table → bars → today-line → status-color → funding-split), D3 transitions, IntersectionObserver not here
- `BudgetByCategory.tsx` — horizontal bars, include/exclude mega-projects toggle
- `FundingProvenanceByCategory.tsx` — 100% stacked bars by category
- `EvoiaMetaVisualWorkspace.tsx` — assembles the 3 charts + selected project detail panel
- `ReconstructionWebsiteModule.tsx` — scrollytelling wrapper with IntersectionObserver, sticky chart panel
- `AnnouncedProjectsDeck.tsx` — 6-slide full-screen presentation deck (keyboard navigation, D3 transitions)

## Presentation deck slides
- Slide 0: ANNOUNCED PROJECTS (category bars, neutral shades)
- Slide 1: FUNDING ORIGIN (bars grouped by fundingProvenance)
- Slide 2: FUNDING ORIGIN + gradient overlays + budget totals (Slide 1 with reserveTotalArea=true)
- Slide 3: FUNDING BY CATEGORY (fillByFunding=true)
- Slide 4: ANNOUNCED BUDGETS (fillByFunding + proportionalBudget)
- Slide 5: BUDGETS BY CATEGORY (horizontal stacked bars)

## Data facts (from DATA_AUDIT.md)
- 77 projects, 8 categories
- Total budget: ~€395M; Infrastructure dominates (€235.5M); top 4 = 85.8% of total
- mega-project threshold: ≥€20M
- timelineStatus today (2026-03-09): completed=20, ongoing=12, past_due_unfinished=6, undated=39
- fundingProvenance: public=42, private_philanthropy=12, mixed_unclear=23

## Implementation phases done
- Phase 0: scaffold (routes, folders, data folders)
- Phase 1: ingestion pipeline (scripts/ingest-evoia-meta.ts + lib)
- Phase 2: table + selectors
- Phase 3: HorizonTimeline
- Phase 4: BudgetByCategory + FundingProvenanceByCategory
- Phase 5: /reconstruction (scrollytelling, website integration)
- Phase 6: /presentation/reconstruction (AnnouncedProjectsDeck, 6 slides)
- Phase 7: QA — not explicitly completed yet

## Main timeline (broader website)
- `src/components/timeline/` — D3Timeline, EventDetailPanel, EventMapPanel, TimelineFilters, TimelineLegend, TimelineWorkspace
- `src/lib/timeline/` — categories, data, filters, index, layout, store, ticks, types
- `src/content/` — events (1970/, 2021/, 2022/), actors/, places/, pages/ in Markdown
- `src/content.config.ts` — Astro content collections config
- Planned: MapLibre map, Keystatic CMS, full event dataset — NOT yet built

## Utilities
- `src/lib/utils/useElementSize.ts` — ResizeObserver hook
- `src/lib/utils/usePrefersReducedMotion.ts` — reduced motion hook
- `src/lib/utils/index.ts`
- `src/lib/map/index.ts` — map utilities stub

## Color / design tokens
- CSS custom properties: `--color-surface`, `--color-surface-soft`, `--color-surface-muted`, `--color-text`, `--color-muted`, `--color-rule`, `--color-accent`, `--color-swatch-blue-2`, `--color-swatch-gray-1/2/3/6`
- Presentation fonts: Bebas Neue Pro (display), Adobe Garamond Pro (body)
- Status colors: completed=#3547aa, past_due_unfinished=#c74949, ongoing=#868ea0, undated=#b2b8c6
- Funding colors: public=#273891, private_philanthropy=#c74949, mixed_unclear=#9ca4b4

## Build commands (to discover)
- Ingest script: likely `npx tsx scripts/ingest-evoia-meta.ts` or `ts-node`
- Astro: `npm run dev` / `npm run build`
