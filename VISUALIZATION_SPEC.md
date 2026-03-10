# Visualization Specification

## Visual system

### Core principle
Minimal, editorial, analytical.

This module must look like a research publication, not a BI dashboard.

### Visual character
- white or warm off-white background
- black / charcoal typography
- thin rules
- compact layout
- quiet accent colors
- SVG-based graphics
- subtle motion only

## Main visual
Component name:
- `HorizonTimeline`

## What it represents
The main visual is a **published horizon timeline**.

Each project is plotted from:
- fixed baseline = **2021-08-03**
to
- parsed indicative end date, when usable

This is **not** a claim about real implementation start dates.

## Required narrative steps

### Step 1 — audit table
A compact evidence table with columns such as:
- tag
- title
- category
- funded by
- funding provenance
- budget
- indicative completion raw
- timeline status

### Step 2 — bars
Rows transform into horizontal bars on a shared time axis.

### Step 3 — today line
Add a vertical line for today.

### Step 4 — status color
Recolor the bars by status:
- completed
- past_due_unfinished
- ongoing
- undated

### Step 5 — funding split
Split the visible groups by funding provenance:
- public
- private_philanthropy
- mixed_unclear

## Undated handling
Projects with no usable end date must **not** be placed on the time axis as if their schedule were known.

When the timeline step is active:
- move them into a separate band labeled `No published end date`
- keep the same ordering rules as much as possible
- let the user still click them

## Ordering rules
Default order for the main visual:
1. category group
2. status
3. end date ascending when available
4. tag as final tie-breaker

Do not randomize order between steps.

## Interaction rules
- hover highlights row / bar / label consistently
- click selects a project
- selected project details appear in a side panel or info block
- support keyboard focus on rows / bars
- support reduced motion

## Detail panel content
At minimum:
- tag
- title
- category
- funding provenance
- funded by
- budget
- raw indicative timeframe
- derived status
- phase flags
- responsible agency
- private actor involved
- comments / notes

## Supporting chart A
Component name:
- `BudgetByCategory`

### Type
Horizontal bar chart.

### Metric
Sum of `announcedBudget`.

### Control
Binary toggle:
- include mega-projects
- exclude mega-projects

### Sorting
Sort by visible budget descending.

### Labels
Show:
- category
- budget total
- optional project count secondary label

### Purpose
Reveal concentration and de-concentrate the field when mega-projects are removed.

## Supporting chart B
Component name:
- `FundingProvenanceByCategory`

### Type
100% stacked horizontal bar chart.

### Basis
Project count, not budget.

### Segments
- public
- private_philanthropy
- mixed_unclear

### Labels
Display count and percentage in tooltip or compact inline annotation.

### Purpose
Reveal category composition by funding provenance.

## Presentation mode
Use the same visualization components in a presentation route.

### Presentation requirements
- 16:9 layout
- larger type
- larger row heights
- explicit previous / next controls
- keyboard navigation
- no sticky scroll logic

## Website mode
- sticky narrative text blocks
- IntersectionObserver changes the active step
- chart stays visible while text advances

## Responsive behavior
### Desktop
- timeline as hero
- detail panel alongside or beneath
- supporting charts in a two-column block when width allows

### Narrow screens
- stacked layout
- simplified labels
- no unreadable dense axis labels
- preserve all data through interaction, not truncation

## Motion rules
- do use smooth but restrained step transitions
- do not use theatrical morphing
- do not animate every label independently
- respect `prefers-reduced-motion`

## Accessibility
- keyboard reachable controls
- visible focus states
- meaningful aria labels on toggles and navigation
- text alternatives for summary metrics
