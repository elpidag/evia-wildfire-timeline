/**
 * verify-gazetteer.ts
 *
 * Queries Nominatim for each unique location in the gazetteer,
 * compares with stored coordinates, and generates a correction report.
 *
 * Usage:
 *   npx tsx scripts/verify-gazetteer.ts              # dry-run report only
 *   npx tsx scripts/verify-gazetteer.ts --fix         # apply corrections
 *   npx tsx scripts/verify-gazetteer.ts --region evia # only verify one region
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Types ──

interface GazetteerEntry {
  lat: number | null;
  lon: number | null;
  nameEn: string;
  region: string;
}

type Gazetteer = Record<string, GazetteerEntry>;

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  importance: number;
}

interface VerificationResult {
  tag: string;
  nameEn: string;
  region: string;
  oldLat: number;
  oldLon: number;
  newLat: number | null;
  newLon: number | null;
  distanceKm: number;
  nominatimName: string;
  status: 'ok' | 'corrected' | 'not_found' | 'large_shift';
}

// ── Config ──

const GAZETTEER_PATH = resolve('data/overrides/alerts-112-gazetteer.json');
const REPORT_PATH = resolve('data/gazetteer-verification-report.json');
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const RATE_LIMIT_MS = 1100; // Nominatim requires <= 1 req/sec
const FLAG_THRESHOLD_KM = 50; // flag as suspicious if shift > this (likely wrong place)

// ── Helpers ──

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Greek region name suffixes for disambiguation */
const REGION_QUALIFIERS: Record<string, string[]> = {
  rhodes: ['Ρόδου', 'Ρόδος'],
  messinia: ['Μεσσηνίας', 'Μεσσηνία'],
  attica_north: ['Αττικής', 'Αττική'],
  attica_west: ['Αττικής', 'Αττική'],
  attica_south: ['Αττικής', 'Αττική'],
  ilia: ['Ηλείας', 'Ηλεία'],
  evia: ['Ευβοίας', 'Εύβοια'],
  fokida: ['Φωκίδας', 'Φωκίδα'],
  grevena: ['Γρεβενών', 'Γρεβενά'],
  arcadia: ['Αρκαδίας', 'Αρκαδία', 'Γορτυνίας'],
  corinthia: ['Κορινθίας', 'Κορινθία'],
  other: [],
};

/** Greek prefectural keywords to validate Nominatim results */
const REGION_VALIDATORS: Record<string, string[]> = {
  rhodes: ['Ρόδου', 'Ρόδος'],
  messinia: ['Μεσσηνίας'],
  attica_north: ['Αττικής', 'Αττική', 'Βορείου', 'Ανατολικής'],
  attica_west: ['Αττικής', 'Αττική', 'Δυτικής'],
  attica_south: ['Αττικής', 'Αττική', 'Νοτίου'],
  ilia: ['Ηλείας'],
  evia: ['Ευβοίας'],
  fokida: ['Φωκίδας'],
  grevena: ['Γρεβενών'],
  arcadia: ['Αρκαδίας', 'Γορτυνίας'],
  corinthia: ['Κορινθίας'],
  other: [],
};

const regionViewboxes: Record<string, string> = {
  rhodes: '27.5,35.8,29.0,36.6',
  messinia: '21.5,36.5,22.3,37.4',
  attica_north: '23.5,37.9,24.1,38.4',
  attica_west: '23.1,37.9,23.6,38.3',
  attica_south: '23.7,37.5,24.2,37.8',
  ilia: '21.3,37.4,21.9,37.8',
  evia: '22.8,38.5,23.6,39.1',
  fokida: '22.0,38.3,22.6,38.6',
  grevena: '21.2,39.7,21.8,40.1',
  arcadia: '21.7,37.3,22.5,37.9',
  corinthia: '22.5,37.7,23.0,37.9',
};

/** Clean tag for search: replace underscores with spaces */
function tagToQuery(tag: string): string {
  return tag.replace(/_/g, ' ');
}

/** Check whether a Nominatim display_name contains region keywords */
function resultMatchesRegion(displayName: string, region: string): boolean {
  const validators = REGION_VALIDATORS[region];
  if (!validators || validators.length === 0) return true; // can't validate
  return validators.some((v) => displayName.includes(v));
}

async function queryNominatim(
  query: string,
  region?: string,
  bounded = false,
): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    countrycodes: 'gr',
    limit: '5',
    'accept-language': 'el,en',
    addressdetails: '0',
  });

  if (region && regionViewboxes[region]) {
    params.set('viewbox', regionViewboxes[region]);
    params.set('bounded', bounded ? '1' : '0');
  }

  const url = `${NOMINATIM_BASE}?${params}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'evia-wildfire-timeline-gazetteer-verify/1.0' },
  });

  if (!res.ok) {
    console.error(`  Nominatim error ${res.status} for "${query}"`);
    return null;
  }

  const results: NominatimResult[] = await res.json();
  if (results.length === 0) return null;

  // If we have a region, prefer a result whose display_name matches the region
  if (region) {
    const regionMatch = results.find((r) => resultMatchesRegion(r.display_name, region));
    if (regionMatch) return regionMatch;
  }

  return results[0];
}

/**
 * Multi-strategy geocoding:
 * 1. "PlaceName RegionName" (e.g. "Σκεπαστή Ευβοίας")
 * 2. "PlaceName RegionName" bounded to viewbox
 * 3. Plain "PlaceName" with viewbox bias
 * 4. English name + "Greece"
 * Returns the best match that validates against the expected region.
 */
async function geocodeWithContext(
  tag: string,
  nameEn: string,
  region: string,
): Promise<{ result: NominatimResult; strategy: string } | null> {
  const query = tagToQuery(tag);
  const qualifiers = REGION_QUALIFIERS[region] ?? [];

  // Strategy 1: Greek name + region qualifier (unbounded)
  for (const qualifier of qualifiers) {
    const result = await queryNominatim(`${query} ${qualifier}`, region);
    await sleep(RATE_LIMIT_MS);
    if (result && resultMatchesRegion(result.display_name, region)) {
      return { result, strategy: `"${query} ${qualifier}"` };
    }
  }

  // Strategy 2: Greek name bounded to viewbox
  const boundedResult = await queryNominatim(query, region, true);
  await sleep(RATE_LIMIT_MS);
  if (boundedResult) {
    return { result: boundedResult, strategy: `"${query}" bounded` };
  }

  // Strategy 3: Greek name with viewbox bias (unbounded)
  const biasedResult = await queryNominatim(query, region);
  await sleep(RATE_LIMIT_MS);
  if (biasedResult && resultMatchesRegion(biasedResult.display_name, region)) {
    return { result: biasedResult, strategy: `"${query}" biased` };
  }

  // Strategy 4: English name + Greece
  const enResult = await queryNominatim(`${nameEn} Greece`, region);
  await sleep(RATE_LIMIT_MS);
  if (enResult && resultMatchesRegion(enResult.display_name, region)) {
    return { result: enResult, strategy: `"${nameEn} Greece"` };
  }

  return null;
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const doFix = args.includes('--fix');
  const regionFilter = args.includes('--region') ? args[args.indexOf('--region') + 1] : null;

  const gazetteer: Gazetteer = JSON.parse(readFileSync(GAZETTEER_PATH, 'utf-8'));

  // Group by unique lat/lon to avoid duplicate queries
  const uniqueByCoords = new Map<string, { tags: string[]; entry: GazetteerEntry }>();

  for (const [tag, entry] of Object.entries(gazetteer)) {
    if (entry.lat === null || entry.lon === null) continue;
    if (regionFilter && entry.region !== regionFilter) continue;

    const key = `${entry.lat},${entry.lon}`;
    if (uniqueByCoords.has(key)) {
      uniqueByCoords.get(key)!.tags.push(tag);
    } else {
      uniqueByCoords.set(key, { tags: [tag], entry });
    }
  }

  console.log(`[verify] ${uniqueByCoords.size} unique locations to verify${regionFilter ? ` (region: ${regionFilter})` : ''}`);
  console.log(`[verify] Mode: ${doFix ? 'FIX (will update gazetteer)' : 'DRY RUN (report only)'}\n`);

  const results: VerificationResult[] = [];
  let checked = 0;
  let corrected = 0;
  let notFound = 0;
  let largeShift = 0;
  let ok = 0;

  for (const [_coordKey, { tags, entry }] of uniqueByCoords) {
    const primaryTag = tags[0];
    checked++;

    process.stdout.write(`[${checked}/${uniqueByCoords.size}] ${primaryTag} (${entry.nameEn})... `);

    const match = await geocodeWithContext(primaryTag, entry.nameEn, entry.region);

    if (!match) {
      console.log('NOT FOUND (all strategies)');
      notFound++;
      results.push({
        tag: primaryTag, nameEn: entry.nameEn, region: entry.region,
        oldLat: entry.lat!, oldLon: entry.lon!,
        newLat: null, newLon: null, distanceKm: -1,
        nominatimName: '', status: 'not_found',
      });
      continue;
    }

    const nLat = parseFloat(match.result.lat);
    const nLon = parseFloat(match.result.lon);
    const dist = haversineKm(entry.lat!, entry.lon!, nLat, nLon);
    processResult(primaryTag, entry, nLat, nLon, dist, match.result.display_name, tags);
  }

  function processResult(
    primaryTag: string, entry: GazetteerEntry,
    nLat: number, nLon: number, dist: number,
    nominatimName: string, tags: string[]
  ) {
    if (dist > FLAG_THRESHOLD_KM) {
      // Nominatim matched a completely different place — don't touch
      console.log(`LARGE SHIFT ${dist.toFixed(1)} km -> ${nominatimName}`);
      largeShift++;
      results.push({
        tag: primaryTag, nameEn: entry.nameEn, region: entry.region,
        oldLat: entry.lat!, oldLon: entry.lon!,
        newLat: nLat, newLon: nLon, distanceKm: dist,
        nominatimName, status: 'large_shift',
      });
    } else {
      // Valid match in the correct region — always use Nominatim coordinates
      const label = dist < 1 ? 'OK' : `UPDATED ${dist.toFixed(1)} km`;
      console.log(`${label} (${nLat.toFixed(4)}, ${nLon.toFixed(4)}) ${nominatimName.slice(0, 60)}`);

      if (dist >= 1) corrected++;
      else ok++;

      if (doFix && dist >= 0.5) {
        for (const tag of tags) {
          gazetteer[tag].lat = parseFloat(nLat.toFixed(6));
          gazetteer[tag].lon = parseFloat(nLon.toFixed(6));
        }
      }

      results.push({
        tag: primaryTag, nameEn: entry.nameEn, region: entry.region,
        oldLat: entry.lat!, oldLon: entry.lon!,
        newLat: nLat, newLon: nLon, distanceKm: dist,
        nominatimName, status: dist < 1 ? 'ok' : 'corrected',
      });
    }
  }

  // ── Summary ──
  console.log('\n══════════════════════════════════════');
  console.log(`RESULTS: ${checked} locations checked`);
  console.log(`  OK (<1 km):       ${ok}`);
  console.log(`  Corrected:       ${corrected}`);
  console.log(`  Large shift:     ${largeShift} (needs manual review)`);
  console.log(`  Not found:       ${notFound}`);
  console.log('══════════════════════════════════════\n');

  // ── Show corrections ──
  const corrections = results.filter((r) => r.status === 'corrected' || r.status === 'large_shift');
  if (corrections.length > 0) {
    console.log('Corrections / flags:');
    for (const c of corrections) {
      const arrow = c.status === 'large_shift' ? '!!' : '->';
      console.log(
        `  ${arrow} ${c.tag} (${c.nameEn}): (${c.oldLat}, ${c.oldLon}) -> (${c.newLat?.toFixed(4)}, ${c.newLon?.toFixed(4)}) [${c.distanceKm.toFixed(1)} km] ${c.nominatimName}`
      );
    }
  }

  // ── Write report ──
  writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nReport written to ${REPORT_PATH}`);

  // ── Write corrected gazetteer ──
  if (doFix && corrected > 0) {
    writeFileSync(GAZETTEER_PATH, JSON.stringify(gazetteer, null, 2) + '\n');
    console.log(`Gazetteer updated with ${corrected} corrections.`);
    console.log(`Large-shift entries (${largeShift}) were NOT auto-corrected — review manually.`);
  } else if (!doFix && corrected > 0) {
    console.log(`\nRun with --fix to apply ${corrected} corrections.`);
    console.log(`Large-shift entries (${largeShift}) will NOT be auto-corrected even with --fix.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
