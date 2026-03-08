# Editing Guide

This guide is for adding and updating research content without changing application code.

## 1. Start the editor

```bash
npm run build:data
npm run dev
```

Open:

- `http://localhost:4321/keystatic`

## 2. Add or update entries

Collections:

- `events`
- `actors`
- `places`
- `pages`

Reference files:

- `src/references/sources.json`
- `src/references/media.json`

### Event checklist

Required before save:

- stable `id` and `slug`
- `start` date and `datePrecision`
- category from controlled vocabulary
- at least one actor id
- at least one place id
- at least one source reference id
- concise summary

Optional but recommended:

- commentary text
- tags
- map geometry or `mapViewport`
- image refs and `coverImage`
- confidence and verification status

## 3. Validate changes

```bash
npm run validate:content
npm run build:data
```

The build fails fast on:

- unknown actor/place/source/media references
- invalid dates
- duplicate ids
- end date before start date
- missing local media files for `/public/...` references

## 4. Preview timeline behavior

After validation:

```bash
npm run dev
```

Check:

- event appears in timeline
- filters include the new category/actor/place/tag values
- detail panel shows linked sources/images
- map focuses geometry or fallback viewport

## 5. Publishing workflow

Suggested sequence:

1. Edit via Keystatic or markdown/json files.
2. Run validation and build checks.
3. Commit changes with a concise message.
4. Open pull request for editorial review.

## Naming conventions

- Event id: `evia-YYYY-short-description`
- Actor id: `actor-...`
- Place id: `place-...`
- Source/media id: lowercase slug style with hyphens

Keep ids stable once public URLs use them.
