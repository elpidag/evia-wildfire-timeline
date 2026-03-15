/**
 * Process raw FIRMS CSV files into a normalized GeoJSON for the fire reconstruction map.
 *
 * Reads all CSV files from data/raw/firms/, merges, deduplicates, and outputs:
 *   public/data/evia/active-fires.geojson
 *
 * Usage:
 *   npx tsx scripts/process-firms-data.ts
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAW_DIR = resolve('data/raw/firms');
const OUT_DIR = resolve('public/data/evia');
const OUT_PATH = join(OUT_DIR, 'active-fires.geojson');

// Evia-focused AOI for filtering (tighter than the full Greece bbox)
const EVIA_AOI = { west: 22.0, south: 37.5, east: 24.5, north: 39.5 };

interface FirmsDetection {
  id: string;
  source: string;
  satellite: string;
  latitude: number;
  longitude: number;
  acq_date: string;
  acq_time_utc: string;
  timestamp_utc: string;
  frp: number;
  confidence: string;
  daynight: string;
  bright_ti4: number;
  bright_ti5: number;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function sourceToSatellite(source: string): string {
  if (source.includes('MODIS')) return 'Terra/Aqua';
  if (source.includes('NOAA20')) return 'NOAA-20';
  if (source.includes('SNPP')) return 'Suomi NPP';
  return source;
}

function inferSource(filename: string): string {
  if (filename.startsWith('MODIS_SP')) return 'MODIS_SP';
  if (filename.startsWith('VIIRS_SNPP_SP')) return 'VIIRS_SNPP_SP';
  if (filename.startsWith('VIIRS_NOAA20_SP')) return 'VIIRS_NOAA20_SP';
  return 'unknown';
}

function normalizeRow(row: Record<string, string>, source: string): FirmsDetection | null {
  const lat = parseFloat(row.latitude);
  const lon = parseFloat(row.longitude);

  if (isNaN(lat) || isNaN(lon)) return null;

  // Filter to AOI
  if (lon < EVIA_AOI.west || lon > EVIA_AOI.east || lat < EVIA_AOI.south || lat > EVIA_AOI.north) {
    return null;
  }

  const acqDate = row.acq_date;
  // FIRMS acq_time is HHMM format
  const rawTime = (row.acq_time ?? '0000').padStart(4, '0');
  const hours = rawTime.slice(0, 2);
  const minutes = rawTime.slice(2, 4);
  const acqTimeUtc = `${hours}:${minutes}`;
  const timestampUtc = `${acqDate}T${acqTimeUtc}:00Z`;

  const frp = parseFloat(row.frp ?? '0') || 0;
  const confidence = row.confidence ?? '';
  const daynight = row.daynight ?? '';
  const brightTi4 = parseFloat(row.bright_ti4 ?? row.brightness ?? '0') || 0;
  const brightTi5 = parseFloat(row.bright_ti5 ?? row.bright_t31 ?? '0') || 0;

  const id = `${source}-${acqDate}-${rawTime}-${lat.toFixed(3)}-${lon.toFixed(3)}`;

  return {
    id,
    source,
    satellite: sourceToSatellite(source),
    latitude: lat,
    longitude: lon,
    acq_date: acqDate,
    acq_time_utc: acqTimeUtc,
    timestamp_utc: timestampUtc,
    frp,
    confidence,
    daynight,
    bright_ti4: brightTi4,
    bright_ti5: brightTi5,
  };
}

function main() {
  const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.csv'));
  if (files.length === 0) {
    console.error('No CSV files found in', RAW_DIR);
    console.error('Run: python3 scripts/fetch-firms-data.py');
    process.exit(1);
  }

  console.log(`[firms] Processing ${files.length} CSV files from ${RAW_DIR}`);

  const seen = new Set<string>();
  const detections: FirmsDetection[] = [];

  for (const file of files) {
    const source = inferSource(file);
    const text = readFileSync(join(RAW_DIR, file), 'utf-8');
    const rows = parseCsv(text);

    for (const row of rows) {
      const det = normalizeRow(row, source);
      if (!det) continue;
      if (seen.has(det.id)) continue;
      seen.add(det.id);
      detections.push(det);
    }
  }

  // Sort by timestamp
  detections.sort((a, b) => a.timestamp_utc.localeCompare(b.timestamp_utc));

  // Build GeoJSON
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: detections.map(d => ({
      type: 'Feature',
      properties: {
        id: d.id,
        source: d.source,
        satellite: d.satellite,
        acq_date: d.acq_date,
        acq_time_utc: d.acq_time_utc,
        timestamp_utc: d.timestamp_utc,
        frp: d.frp,
        confidence: d.confidence,
        daynight: d.daynight,
      },
      geometry: {
        type: 'Point',
        coordinates: [d.longitude, d.latitude],
      },
    })),
  };

  // Stats
  const bySource = new Map<string, number>();
  const byDate = new Map<string, number>();
  for (const d of detections) {
    bySource.set(d.source, (bySource.get(d.source) ?? 0) + 1);
    byDate.set(d.acq_date, (byDate.get(d.acq_date) ?? 0) + 1);
  }

  console.log(`[firms] Total detections: ${detections.length}`);
  console.log('[firms] By source:');
  for (const [s, c] of bySource) console.log(`  ${s}: ${c}`);
  console.log('[firms] By date:');
  for (const [d, c] of [...byDate].sort()) console.log(`  ${d}: ${c}`);

  // Write output
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(geojson));
  console.log(`[firms] Wrote ${OUT_PATH} (${(JSON.stringify(geojson).length / 1024).toFixed(0)} KB)`);
}

main();
