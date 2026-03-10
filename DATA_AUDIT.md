# Data Audit

## Workbook analyzed
- File: `EviaMeta_Works.xlsx`
- Sheet used in V1: `Works_EN`

## Row count
- Total projects: **77**

## Raw columns in `Works_EN`
- `tag`
- `title`
- `subtitle`
- `category`
- `funded by`
- `approved`
- `included in a programme`
- `open to assignment`
- `assigned`
- `completion`
- `responsible agency`
- `private actor involved`
- `announced budget`
- `indicative completion timeframe`
- `budget different than announced`
- `furthered timeframe`
- `description`
- `location-area of implementation`
- `comments`

## Category distribution
- Forest: **16**
- Culture: **15**
- Healthcare & Welfare: **11**
- Agrifood sector: **10**
- Human Resources: **10**
- Tourism: **8**
- Infrastructure: **5**
- General: **2**

## Budget observations
Parsed announced budget total: **€395,055,350**

Budget by category:
- Infrastructure: **€235,500,000**
- Human Resources: **€112,826,000**
- Forest: **€24,502,580**
- Culture: **€6,948,615**
- Tourism: **€6,863,000**
- Healthcare & Welfare: **€3,695,155**
- Agrifood sector: **€2,820,000**
- General: **€1,900,000**

### Concentration
- Largest single project budget: **€230,000,000**
- Largest project share of total announced budget: **58.2%**
- Top 4 projects share of total announced budget: **85.8%**

Implication:
the module needs an **include / exclude mega-projects** view for budget charts.

## Completion field
Raw completion values:
- `yes`: **20**
- `no`: **57**

## Indicative completion timeframe field
Observed values:
- blank / missing: **51**
- year-only values: **23**
- one month range: **1**
- relative duration text: **2**

Recognized usable date values in V1:
- `2023`
- `2024`
- `2025`
- `2026`
- `2027`
- `2029`
- `07/2022 - 06/2023`

Non-usable schedule values in V1:
- blank
- `12 months_no exact date mentioned`

## Derived status counts for V1
Using these rules:
- `completion == yes` -> `completed`
- `completion == no` and usable end date before today -> `past_due_unfinished`
- `completion == no` and usable end date on/after today -> `ongoing`
- no usable end date -> `undated`

Using today = **2026-03-09**:
- completed: **20**
- ongoing: **12**
- past_due_unfinished: **6**
- undated: **39**

## Funding provenance mapping for V1

### `private_philanthropy`
- `Donations`

### `public`
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

### `mixed_unclear`
- `Other`
- blank
- any source not explicitly mapped above

Counts in V1:
- public: **42**
- private_philanthropy: **12**
- mixed_unclear: **23**

## Data caveats
- Some titles are blank and should fall back to `subtitle` or `tag` if needed.
- Budget parsing must preserve the raw budget string.
- The workbook contains ambiguity in funding provenance and scheduling.
- Missing schedule data is itself an editorial finding and should be shown explicitly.
- The parser must support a manual override layer for corrections.

## Recommended override file
Use:
- `data/overrides/evoia-meta-overrides.json`

Purpose:
- normalize names
- repair blanks
- annotate caveats
- add external IDs later
