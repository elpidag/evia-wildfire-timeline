# Data Ingestion Specification

## Goal
Convert the workbook into a strict, typed JSON dataset for the frontend.

## Pipeline
`data/raw/EviaMeta_Works.xlsx -> scripts/ingest-evoia-meta.ts -> data/generated/*.json`

## Input
- workbook path: `data/raw/EviaMeta_Works.xlsx`
- sheet: `Works_EN`

## Output files
- `data/generated/evoia-meta-projects.json`
- `data/generated/evoia-meta-summary.json`

## Output shape

```ts
type FundingProvenance = "public" | "private_philanthropy" | "mixed_unclear";
type TimelineStatus = "completed" | "past_due_unfinished" | "ongoing" | "undated";

type EvoiaMetaProject = {
  id: string;
  rowNumber: number;

  tag: string;
  titleRaw: string | null;
  subtitleRaw: string | null;
  displayTitle: string;

  category: string;

  fundedByRaw: string | null;
  fundingProvenance: FundingProvenance;

  approved: boolean;
  includedInProgramme: boolean;
  openToAssignment: boolean;
  assigned: boolean;
  completed: boolean;

  announcedBudgetRaw: string | number | null;
  announcedBudget: number | null;

  indicativeCompletionRaw: string | null;
  indicativeEndDateISO: string | null;
  indicativeEndPrecision: "year" | "month" | "range" | "relative" | "unknown";
  hasUsableEndDate: boolean;

  furtheredTimeframeRaw: string | null;
  budgetDifferentThanAnnouncedRaw: string | number | null;

  responsibleAgency: string | null;
  privateActorInvolved: string | null;
  description: string | null;
  locationArea: string | null;
  comments: string | null;

  sourceTable: "A" | "B" | "AB";
  timelineStatus: TimelineStatus;
  isMegaProject: boolean;
};
```

## Parsing rules

### Boolean columns
Treat these values as true:
- `yes`
- `true`
- `1`

Treat these values as false:
- `no`
- `false`
- `0`
- blank

Normalize case and whitespace before parsing.

### Budget parsing
- remove `€`
- remove commas
- trim whitespace
- parse to number
- preserve raw value in `announcedBudgetRaw`

### Title fallback
Set `displayTitle` with this priority:
1. `title`
2. `subtitle`
3. `tag`

### Source table derivation
- tags beginning with `A` -> `A`
- tags beginning with `B` -> `B`
- tags beginning with `AB` -> `AB`

### Timeframe parsing
Recognize these forms in V1:

#### Year-only
Examples:
- `2023`
- `2024`
- `2025`
- `2026`
- `2027`
- `2029`

Mapping rule:
- convert to December 31 of that year
- precision = `year`

#### Range
Example:
- `07/2022 - 06/2023`

Mapping rule:
- use the last day of the final month
- output `2023-06-30`
- precision = `range`

#### Relative text
Example:
- `12 months_no exact date mentioned`

Mapping rule:
- `indicativeEndDateISO = null`
- `hasUsableEndDate = false`
- precision = `relative`

#### Missing / blank
Mapping rule:
- `indicativeEndDateISO = null`
- `hasUsableEndDate = false`
- precision = `unknown`

## Funding provenance mapping

### private philanthropy
- `Donations`

### public
- Regional Program of Sterea Ellada 2021-2027
- National Development Program 2021-2025
- Recovery & Resilience Plan
- Green Fund
- Regional Development Program 2021-2025
- Regional Operational Program of Sterea Ellada 2014-2020 (ΠΕΠ 2014-2020)
- Competitiveness Programme 2021-2027
- National Employment Service (Δ.ΥΠ.Α)
- National Infrastructure Development Program
- Sectoral Development Program of the Ministry of Education 2021-2025
- Rural Development Programme
- Good Governance - Institutions and Transparency / EEA Grants 2014–2021
- OFYPEKA
- PEKA (former YMEPERAA)

### mixed / unclear
- `Other`
- blank
- any unmatched source

## Derived fields

### timelineStatus
Given `today` at runtime or build time:
- `completed` if `completed == true`
- `past_due_unfinished` if `completed == false` and `hasUsableEndDate == true` and end date < today
- `ongoing` if `completed == false` and `hasUsableEndDate == true` and end date >= today
- `undated` if `hasUsableEndDate == false`

### isMegaProject
For V1:
- `announcedBudget >= 20_000_000`

## Summary JSON
Create a summary file with:
- totalProjects
- totalBudget
- categories array with project counts and budget totals
- funding provenance counts
- timeline status counts
- date extent
- mega project stats
- parsing warnings

## Manual overrides
Apply `data/overrides/evoia-meta-overrides.json` after raw parsing and before final derivations.

Supported override use cases:
- replace display title
- add notes
- normalize category or funder names
- patch missing metadata

## Frontend rule
The frontend must import only the generated JSON, not the workbook.
