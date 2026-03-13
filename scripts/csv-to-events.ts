/**
 * csv-to-events.ts
 *
 * Converts public/data/DataCollection.csv → public/data/events.index.json
 *
 * Usage:
 *   npx tsx scripts/csv-to-events.ts            # write output file
 *   npx tsx scripts/csv-to-events.ts --dry-run  # print JSON, don't write
 *
 * Re-run whenever DataCollection.csv is updated.
 * The script overwrites events.index.json entirely each time.
 *
 * CSV columns expected (row 1 = header):
 *   id, symbol, event title, type of event, start date, end date,
 *   exact location, location coordinate x, location coordinate y,
 *   location Region, summary text, main agency, main actor, secondary actor,
 *   source link, Image 01, Image 02, Image 03
 *
 * Dates must be in DD/MM/YYYY format.
 * Rows with no "type of event" or no parseable start date are skipped with a warning.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const CSV_PATH = join(ROOT, 'public', 'data', 'DataCollection.csv');
const OUTPUT_PATH = join(ROOT, 'public', 'data', 'events.index.json');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Category mapping ─────────────────────────────────────────────────────────
// Map CSV "type of event" (lowercase, trimmed) → schema category slug.
// Valid slugs are defined in src/lib/data/schemas.ts categoryValues.
const CATEGORY_MAP: Record<string, string> = {
  'active fire': 'wildfire',
  'fire (between suppression of the main fronts and full suppression)': 'suppression',
  'announcement / meeting / event by the greek government': 'state-agency-action',
  'announcement / meeting / event  by the greek government': 'state-agency-action',
  'announcement / meeting / event by other official state agencies': 'state-agency-action',
  'announcement / meeting / event  by other official state agencies': 'state-agency-action',
  'announcement / meeting / event by local municipalities': 'municipal-action',
  'announcement / meeting / event  by local municipalities': 'municipal-action',
  'announcement / meeting / event by local municipalities or other official state agencies': 'municipal-action',
  'announcement / meeting / event  by local municipalities or other official state agencies': 'municipal-action',
  'announcement / meetings / events / demonstrations by civil society': 'civil-society-action',
  'announcement / meeting / event by private actors': 'private-actor',
  'announcement / meeting / event  by private actors': 'private-actor',
  'contracts signed between private actors': 'contract',
  "contracts signed between 'diazoma', donors & consultant agencies": 'contract',
  'contracts signed between diazoma, donors & consultant agencies': 'contract',
  "meetings-events organised by 'diazoma'": 'reconstruction-governance',
  'meetings-events organised by diazoma': 'reconstruction-governance',
  'flood': 'flood',
  'legislation changes': 'legislation',
  'forest legislation changes': 'legislation',
  'forestry service works': 'forestry-policy',
  'spatial planning phases': 'spatial-planning',
  'elections': 'election',
  'election': 'election',
  'event': 'state-agency-action',
};

// ─── Place mapping ────────────────────────────────────────────────────────────
// Place IDs containing "evia" go to the Evia band in the timeline.
type PlaceLabel = { id: string; name: string; slug: string };

const PLACE_MAP: Record<string, PlaceLabel> = {
  'north evia': { id: 'place-north-evia', name: 'North Evia', slug: 'north-evia' },
  'evia': { id: 'place-evia', name: 'Evia', slug: 'evia' },
  'attica': { id: 'place-attica', name: 'Attica', slug: 'attica' },
  'peloponese': { id: 'place-peloponese', name: 'Peloponnese', slug: 'peloponese' },
  'peloponesse': { id: 'place-peloponese', name: 'Peloponnese', slug: 'peloponese' },
  'peloponnese': { id: 'place-peloponese', name: 'Peloponnese', slug: 'peloponese' },
  'sterea ellada': { id: 'place-sterea-ellada', name: 'Sterea Ellada', slug: 'sterea-ellada' },
  'greece': { id: 'place-greece', name: 'Greece', slug: 'greece' },
};

// ─── CSV parser ───────────────────────────────────────────────────────────────
// Handles quoted fields (including fields with embedded newlines and commas).
function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        // Escaped double-quote inside a quoted field
        field += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i += 2;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush last field and row
  if (field.trim() || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

function parseDdMmYyyy(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  return `${m[3]}-${month}-${day}`;
}

function toTimestamp(isoDate: string, endOfDay: boolean): number {
  const [y, mo, d] = isoDate.split('-').map(Number);
  return endOfDay
    ? Date.UTC(y, mo - 1, d, 23, 59, 59)
    : Date.UTC(y, mo - 1, d, 0, 0, 0);
}

function mapCategory(rawType: string): string {
  const key = rawType.trim().toLowerCase();
  const mapped = CATEGORY_MAP[key];
  if (!mapped) {
    console.warn(`  ⚠  Unknown category: "${rawType}" → defaulting to "state-agency-action"`);
    return 'state-agency-action';
  }
  return mapped;
}

function mapPlace(rawRegion: string): PlaceLabel {
  const key = rawRegion.trim().toLowerCase();
  const mapped = PLACE_MAP[key];
  if (!mapped) {
    const slug = slugify(rawRegion) || 'unknown';
    console.warn(`  ⚠  Unknown region: "${rawRegion}" → using "place-${slug}"`);
    return { id: `place-${slug}`, name: rawRegion.trim(), slug };
  }
  return mapped;
}

type ActorLabel = { id: string; name: string; slug: string };

function extractActors(mainActor: string, mainAgency: string, secondaryActor: string): ActorLabel[] {
  const result: ActorLabel[] = [];
  const seen = new Set<string>();

  for (const raw of [mainActor, mainAgency, secondaryActor]) {
    for (const part of raw.split(',')) {
      const name = part.trim();
      if (!name) continue;
      const slug = slugify(name);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      result.push({ id: `actor-${slug}`, name, slug });
    }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main(): void {
  if (!existsSync(CSV_PATH)) {
    console.error(`CSV file not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const source = readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, ''); // strip BOM
  const rows = parseCsv(source);

  if (rows.length < 2) {
    console.error('CSV has no data rows.');
    process.exit(1);
  }

  // Map header names to column indices (case-insensitive)
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const col = (name: string): number => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`CSV is missing required column: "${name}"`);
    return idx;
  };

  const C = {
    title: col('event title'),
    type: col('type of event'),
    startDate: col('start date'),
    endDate: col('end date'),
    location: col('exact location'),
    coordX: col('location coordinate x'),
    coordY: col('location coordinate y'),
    region: col('location region'),
    summary: col('summary text'),
    mainAgency: col('main agency'),
    mainActor: col('main actor'),
    secondaryActor: col('secondary actor'),
    sourceLink: col('source link'),
  };

  const seenIds = new Map<string, number>();
  const events: object[] = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];

    // Skip fully empty rows
    if (!cells || cells.every((c) => !c)) continue;

    const rawType = cells[C.type]?.trim() ?? '';
    if (!rawType) continue; // no category → skip continuation / blank rows

    const rawStart = cells[C.startDate]?.trim() ?? '';
    const startIso = parseDdMmYyyy(rawStart);
    if (!startIso) {
      console.warn(`  Row ${r + 1}: skipping — unparseable start date "${rawStart}"`);
      skipped++;
      continue;
    }

    const rawEnd = cells[C.endDate]?.trim() ?? '';
    const endIso = parseDdMmYyyy(rawEnd);
    const end = endIso && endIso !== startIso ? endIso : null;

    const startTs = toTimestamp(startIso, false);
    const endTs = end ? toTimestamp(end, true) : null;

    const rawTitle = cells[C.title]?.trim() ?? '';
    const rawRegion = cells[C.region]?.trim() ?? '';
    const rawSummary = cells[C.summary]?.trim() ?? '';
    const rawMainActor = cells[C.mainActor]?.trim() ?? '';
    const rawMainAgency = cells[C.mainAgency]?.trim() ?? '';
    const rawSecondaryActor = cells[C.secondaryActor]?.trim() ?? '';
    const rawSourceLink = cells[C.sourceLink]?.trim() ?? '';

    const rawCoordX = cells[C.coordX]?.trim() ?? '';
    const rawCoordY = cells[C.coordY]?.trim() ?? '';
    const coordX = parseFloat(rawCoordX);
    const coordY = parseFloat(rawCoordY);
    const hasCoords = !isNaN(coordX) && !isNaN(coordY);

    const category = mapCategory(rawType);
    const placeLabel = rawRegion ? mapPlace(rawRegion) : { id: 'place-greece', name: 'Greece', slug: 'greece' };
    const actorLabels = extractActors(rawMainActor, rawMainAgency, rawSecondaryActor);

    // Generate a unique ID
    const titleForSlug = rawTitle || rawType;
    const year = startIso.slice(0, 4);
    const baseId = `evia-${year}-${slugify(titleForSlug) || category}`;
    const n = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, n + 1);
    const id = n === 0 ? baseId : `${baseId}-${n}`;
    const slug = slugify(rawTitle || rawType) || category;

    const title = rawTitle || rawType;
    const summary = rawSummary || title;

    // Body: preserve source link if present
    const body = rawSourceLink ? `Source: ${rawSourceLink}` : '';

    const displayDate = end ? `${startIso} to ${end}` : startIso;

    const event: Record<string, unknown> = {
      id,
      slug,
      title,
      summary,
      body,
      category,
      start: startIso,
      end,
      datePrecision: 'day',
      isOngoing: false,
      displayDate,
      startTs,
      endTs,
      actors: actorLabels.map((a) => a.id),
      places: [placeLabel.id],
      tags: [],
      sourceRefs: [],
      imageRefs: [],
      coverImage: null,
      featured: false,
      actorLabels,
      placeLabels: [placeLabel],
    };

    if (hasCoords) {
      event['geometry'] = { type: 'Point', coordinates: [coordX, coordY] };
    }

    events.push(event);
  }

  // Sort chronologically
  (events as Array<Record<string, unknown>>).sort((a, b) => {
    const tsDiff = (a['startTs'] as number) - (b['startTs'] as number);
    if (tsDiff !== 0) return tsDiff;
    return (a['id'] as string).localeCompare(b['id'] as string);
  });

  const json = JSON.stringify(events, null, 2);

  if (DRY_RUN) {
    console.log(json);
    console.log(`\n— ${events.length} events compiled, ${skipped} rows skipped (dry run, not written).`);
    return;
  }

  writeFileSync(OUTPUT_PATH, json, 'utf8');
  console.log(`✓  Wrote ${events.length} events → public/data/events.index.json  (${skipped} rows skipped)`);
}

main();
