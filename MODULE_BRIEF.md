# Module Brief

## Editorial objective

This module is not a generic dashboard. It is an **investigative accountability view** of the Evia reconstruction programme after the 2021 wildfires.

The core question is:

**How is the reconstruction programme structured, funded, and progressing over time according to its own published schedule and completion data?**

## Source basis

V1 is based on:
- the public panorama register at `https://evoia-meta.gov.gr/panorama`
- the workbook `EviaMeta_Works.xlsx`, sheet `Works_EN`

The panorama site presents the programme as a combined register across:
- **Table A / Masterplan**
- **Table B / Approved Strategy**

The site also frames the programme as a living, updated register of projects, rather than a frozen list. This supports building a data module that can be refreshed over time.

## Visual argument

The module should communicate four messages:

1. the programme is large but unevenly structured
2. money is concentrated in a few very large projects
3. scheduling is partially legible and partially opaque
4. public and private / philanthropic funding do not distribute evenly across categories

## User stories

### Researcher
A researcher can scan all projects, sort them, inspect their fields, and identify overdue or undated cases.

### Reader
A general reader can understand the programme without needing to parse a spreadsheet.

### Presenter
A teacher can use the same visuals in class without redesigning them.

## Key design decision

The main timeline must be described as one of the following:
- **Published timeline**
- **Published horizon**
- **Promised horizon since the fire**

Do **not** describe it as actual project duration unless the dataset later gains reliable real start dates.

## V1 scope

### In scope
- one normalized dataset from the workbook
- one scrollytelling route
- one presentation route
- three custom chart components
- one evidence table
- one small data-summary block

### Out of scope for V1
- live scraping or syncing from the website
- map view for these projects
- network graph
- Sankey
- automatic OCR / PDF extraction
- edit UI inside the module
