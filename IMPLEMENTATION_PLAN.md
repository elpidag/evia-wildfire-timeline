# Implementation Plan

## Phase 0 — scaffold confirmation
Goal:
confirm the website repo can host the module.

Deliverables:
- route stubs
- component folders
- data folders
- prompt files committed
- config file committed

Acceptance:
- clean folder structure exists
- no dead placeholder code

## Phase 1 — ingestion pipeline
Goal:
turn the workbook into stable typed JSON.

Files:
- `scripts/ingest-evoia-meta.ts`
- `src/lib/evoia-meta/schema.ts`
- `src/lib/evoia-meta/parse.ts`
- `src/lib/evoia-meta/derive.ts`
- `src/lib/evoia-meta/selectors.ts`
- `data/generated/evoia-meta-projects.json`
- `data/generated/evoia-meta-summary.json`

Acceptance:
- all 77 rows parse
- generated JSON validates
- summary metrics match the audit doc unless warnings are emitted
- script is rerunnable

## Phase 2 — table and selectors
Goal:
build the evidence table and shared selectors.

Files:
- `src/components/evoia-meta/AuditTable.tsx`
- `src/lib/evoia-meta/format.ts`
- shared column definitions if using TanStack Table

Acceptance:
- sortable columns
- no invented data
- stable formatting for euro amounts and dates

## Phase 3 — horizon timeline
Goal:
build the main step-based chart.

Files:
- `src/components/evoia-meta/HorizonTimeline.tsx`
- optional step-state helper
- small shared legend component

Acceptance:
- table -> bars -> today -> status -> funding split states
- undated projects in their own labeled band
- selection works
- reduced motion respected

## Phase 4 — supporting charts
Goal:
build the two structural charts.

Files:
- `src/components/evoia-meta/BudgetByCategory.tsx`
- `src/components/evoia-meta/FundingProvenanceByCategory.tsx`

Acceptance:
- budget chart toggles mega-project inclusion
- provenance stacks sum to 100%
- charts share formatting helpers

## Phase 5 — website integration
Goal:
mount the module in the main site.

Files:
- `src/pages/reconstruction.astro`
- narrative wrappers and step activation logic

Acceptance:
- sticky narrative works
- chart state syncs with scroll steps
- hydration stays limited to the interactive island

## Phase 6 — presentation route
Goal:
re-use components in classroom mode.

Files:
- `src/pages/presentation/reconstruction.astro`
- keyboard step controls

Acceptance:
- next / previous controls work
- keyboard navigation works
- no duplicated chart logic

## Phase 7 — QA and refinement
Goal:
polish, verify, and harden.

Checks:
- build passes
- typecheck passes
- lint passes
- visual review on desktop and projector-sized layout
- reduced-motion review
- compact print / screenshot review

## Explicit non-goals for this implementation window
- no live synchronization with panorama site
- no map
- no network graph
- no CMS integration specific to this module
