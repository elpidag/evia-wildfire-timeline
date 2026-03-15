/**
 * One-time helper: extract unique hashtags from 112 alerts and optionally
 * query Nominatim for initial coordinate estimates.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-gazetteer.ts              # extract tags only (dry-run)
 *   npx tsx scripts/bootstrap-gazetteer.ts --nominatim   # also query Nominatim
 *
 * Output: data/overrides/alerts-112-gazetteer.json (draft — verify manually)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const alertsPath = join(repoRoot, 'data', 'alerts_112_aug_2021_all.json');
const gazetteerPath = join(repoRoot, 'data', 'overrides', 'alerts-112-gazetteer.json');

type GazetteerEntry = {
  lat: number | null;
  lon: number | null;
  nameEn: string;
  region: string;
};

type Gazetteer = Record<string, GazetteerEntry>;

type RawAlert = {
  entities: {
    hashtags: Array<{ tag: string; start: number; end: number }>;
  };
};

async function nominatimLookup(query: string): Promise<{ lat: number; lon: number } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query.replace(/_/g, ' '));
  url.searchParams.set('countrycodes', 'gr');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'evia-wildfire-timeline-bootstrap/1.0' }
  });

  if (!response.ok) return null;

  const results = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (results.length === 0) return null;

  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon)
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const useNominatim = process.argv.includes('--nominatim');

  if (!existsSync(alertsPath)) {
    throw new Error(`Alerts file not found: ${relative(repoRoot, alertsPath)}`);
  }

  const alerts = JSON.parse(readFileSync(alertsPath, 'utf8')) as RawAlert[];
  const tags = new Set<string>();

  for (const alert of alerts) {
    for (const hashtag of alert.entities.hashtags) {
      tags.add(hashtag.tag);
    }
  }

  const sortedTags = [...tags].sort();
  console.log(`[gazetteer] Found ${sortedTags.length} unique hashtags`);

  // Load existing gazetteer if present
  let existing: Gazetteer = {};
  if (existsSync(gazetteerPath)) {
    existing = JSON.parse(readFileSync(gazetteerPath, 'utf8')) as Gazetteer;
    console.log(`[gazetteer] Loaded existing gazetteer with ${Object.keys(existing).length} entries`);
  }

  const gazetteer: Gazetteer = {};

  for (const tag of sortedTags) {
    if (existing[tag]) {
      gazetteer[tag] = existing[tag];
      continue;
    }

    let lat: number | null = null;
    let lon: number | null = null;

    if (useNominatim) {
      console.log(`[gazetteer] Looking up: ${tag}`);
      const result = await nominatimLookup(tag);
      if (result) {
        lat = Math.round(result.lat * 1000) / 1000;
        lon = Math.round(result.lon * 1000) / 1000;
        console.log(`  → ${lat}, ${lon}`);
      } else {
        console.log(`  → not found`);
      }
      await sleep(1100); // Nominatim rate limit: 1 req/s
    }

    gazetteer[tag] = {
      lat,
      lon,
      nameEn: tag.replace(/_/g, ' '),
      region: 'other'
    };
  }

  writeFileSync(gazetteerPath, JSON.stringify(gazetteer, null, 2) + '\n');
  console.log(`[gazetteer] Wrote ${relative(repoRoot, gazetteerPath)} (${Object.keys(gazetteer).length} entries)`);

  const missing = Object.values(gazetteer).filter((entry) => entry.lat === null).length;
  if (missing > 0) {
    console.log(`[gazetteer] ${missing} entries still need coordinates — verify manually`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[gazetteer] failed: ${message}`);
  process.exit(1);
});
