# Design System

## Design goal

The site should feel like a cross between:

- **Forensic Architecture** — evidentiary, spatial, restrained, analytical

The result should be:

- minimal,
- precise,
- publication-grade,
- and clearly research-led.

## Visual principles

1. **Quiet surface, dense meaning**
2. **Editorial hierarchy over app chrome**
3. **Color used structurally, not decoratively**
4. **Maps and timelines are analytical instruments**
5. **Whitespace is for concentration, not luxury branding**

## Palette

Use an understated palette with high contrast.

### Base

- background: warm off-white or very light grey
- primary text: near-black / charcoal
- secondary text: muted graphite
- rules / dividers: cool grey

### Category colors

Assign muted, non-neon colors to categories.

Example direction:

- wildfire / fire-season: deep ember red
- legislation / policy: muted blue-black
- reconstruction / contracts: ochre or muted gold
- civil society / protest: muted violet or rust
- weather / flood: slate blue
- private actors: dark olive or neutral brown

Use color sparingly and consistently.

## Typography

### Tone

Use one serif + one sans combination, or a strong sans-only system if implementation simplicity matters.

### Recommendation

- headings: refined serif or newspaper-style serif
- UI labels / metadata / filters: clean sans
- body: readable serif or neutral sans depending on performance and licensing choices

### Rules

- large, confident page title
- compact metadata labels
- generous line-height for commentary text
- numeric dates should feel exact and aligned

## Layout

### Desktop

Preferred three-zone structure:

- top: title / intro / controls
- main left or center: timeline
- main right or lower-right: detail panel
- lower or side pane: synchronized map

### Mobile

- stacked layout
- timeline first
- detail panel as sheet/drawer
- map collapsible or secondary tab

## Core components

## 1) Timeline bar

Must feel bespoke, not generic.

### Rules

- a strong baseline
- disciplined ticks
- soft lane separators
- point events as minimal marks with hover affordance
- duration events as bars with understated fills
- selected state clearly visible but not loud

### Labels

- show only the labels the zoom level can support
- truncate elegantly
- prefer full label in tooltip / detail panel

## 2) Detail panel

This is the interpretive heart of the interface.

### Include

- title
- date
- category pill
- actor list
- place list
- summary
- extended text
- sources
- image block

### Behavior

- opens quickly
- scrolls independently if long
- keeps context visible
- preserves current timeline position

## 3) Map

The map should not feel like a consumer travel map.

### Rules

- use a subdued basemap
- prioritize overlays over loud terrain styling
- keep labels limited
- selected geometry should be legible and exact
- use fitBounds / flyTo softly, with reduced-motion fallback

### Cartographic style direction

- restrained land/water contrast
- thin outlines
- muted labels
- avoid saturated Google-like cartography

## 4) Filters

Filters should read like an editorial index, not a SaaS dashboard.

### Rules

- simple typography
- checkbox / pill hybrids are acceptable
- avoid oversized toggles
- show counts if cheap to compute
- always provide clear reset

## Motion

Motion must support comprehension.

### Good motion

- timeline zoom interpolation
- soft drawer transitions
- map fit transitions
- hover emphasis

### Bad motion

- decorative parallax
- excessive easing
- bouncing UI
- animated counters

## Imagery

Images should be used as evidence or context, not moodboards.

### Rules

- consistent aspect ratios when possible
- captions and credits required
- click to enlarge only if valuable
- lazy-load non-primary media

## Accessibility and legibility

- minimum contrast must remain high
- color is never the only category signal
- keyboard focus must be clearly visible
- touch targets cannot be too small
- chart/timeline lines should remain readable for low-vision users

## Tone of microcopy

Use restrained, factual language.

### Good

- “View event”
- “Reset filters”
- “Date range”
- “Linked actors”
- “Sources”

### Avoid

- “Explore the magic”
- “Dive in”
- “Powerful insights”
- startup-style promotional phrasing

## Editorial detail cues

To capture the FT / NYT / FA influence without imitation:

- use fine divider lines
- use small caps or compact metadata styles sparingly
- allow long titles without making them decorative
- keep spacing measured and consistent
- use captions seriously

## CSS / implementation guidance

- define spacing, border, radius, shadow, and color tokens once
- prefer flat surfaces over card-heavy UI
- avoid excessive rounded corners
- prefer borders and rules to drop shadows
- reserve accent fills for selected state and category hints

## Final design test

When the interface is open, it should feel like:

- a research publication,
- a cartographic evidence workspace,
- and a serious public document.

It should not feel like:

- a startup dashboard,
- a SaaS admin panel,
- or a generic template timeline.
