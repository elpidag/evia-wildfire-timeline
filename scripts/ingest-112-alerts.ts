/**
 * Ingestion pipeline for 112 emergency alerts.
 *
 * Reads raw scraped tweets + gazetteer, produces:
 *   data/generated/alerts-112.json         — processed alert array
 *   data/generated/alerts-112-summary.json — summary stats
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alertsSummarySchema,
  gazetteerSchema,
  processedAlertSchema,
  rawAlertSchema,
  type Gazetteer,
  type ProcessedAlert,
  type RawAlert
} from '../src/lib/alerts/schema';
import {
  buildEvacuationEdges,
  classifyAlertType,
  computeCentroid,
  determineFireRegion,
  expandCompoundHashtags,
  extractFromToLocations
} from '../src/lib/alerts/parse-alert';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const alertsInputPath = join(repoRoot, 'data', 'alerts_112_aug_2021_all.json');
const gazetteerPath = join(repoRoot, 'data', 'overrides', 'alerts-112-gazetteer.json');
const generatedAlertsPath = join(repoRoot, 'data', 'generated', 'alerts-112.json');
const generatedSummaryPath = join(repoRoot, 'data', 'generated', 'alerts-112-summary.json');

function ensureOutputDirectory(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJson(path: string, value: unknown): void {
  ensureOutputDirectory(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function loadRawAlerts(): RawAlert[] {
  if (!existsSync(alertsInputPath)) {
    throw new Error(`Alerts file not found: ${relative(repoRoot, alertsInputPath)}`);
  }

  const raw = JSON.parse(readFileSync(alertsInputPath, 'utf8')) as unknown[];
  return raw.map((entry, index) => {
    try {
      return rawAlertSchema.parse(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Alert at index ${index} failed schema validation: ${message}`, { cause: error });
    }
  });
}

function loadGazetteer(): Gazetteer {
  if (!existsSync(gazetteerPath)) {
    throw new Error(`Gazetteer not found: ${relative(repoRoot, gazetteerPath)}`);
  }

  const raw = JSON.parse(readFileSync(gazetteerPath, 'utf8')) as unknown;
  return gazetteerSchema.parse(raw);
}

function processAlert(
  raw: RawAlert,
  gazetteer: Gazetteer,
  chronologicalIndex: number
): ProcessedAlert {
  const alertType = classifyAlertType(raw.text);
  const expandedHashtags = expandCompoundHashtags(raw.text, raw.entities.hashtags, gazetteer);
  const fireRegion = determineFireRegion(expandedHashtags, gazetteer);
  const { from, to } = extractFromToLocations(raw.text, expandedHashtags, gazetteer, fireRegion);
  const allLocations = [...from, ...to];
  const centroid = computeCentroid(allLocations.length > 0 ? allLocations : from);
  const evacuationEdges = buildEvacuationEdges(from, to);

  return {
    tweetId: raw.tweet_id,
    timestamp: raw.created_at_local,
    timestampUtc: raw.created_at_utc,
    chronologicalIndex,
    text: raw.text,
    alertType,
    fireRegion,
    fromLocations: from,
    toLocations: to,
    centroid,
    evacuationEdges,
    engagement: {
      retweets: raw.public_metrics.retweet_count,
      likes: raw.public_metrics.like_count,
      replies: raw.public_metrics.reply_count
    },
    sourceUrl: raw.source_url
  };
}

function buildSummary(alerts: ProcessedAlert[]) {
  const countByRegion: Record<string, number> = {};
  const countByType: Record<string, number> = {};
  const countByDay: Record<string, number> = {};
  let geocodedCount = 0;
  let evacuationEdgeCount = 0;

  for (const alert of alerts) {
    countByRegion[alert.fireRegion] = (countByRegion[alert.fireRegion] ?? 0) + 1;
    countByType[alert.alertType] = (countByType[alert.alertType] ?? 0) + 1;

    const day = alert.timestamp.slice(0, 10);
    countByDay[day] = (countByDay[day] ?? 0) + 1;

    if (alert.centroid) geocodedCount++;
    evacuationEdgeCount += alert.evacuationEdges.length;
  }

  let peakDay = '';
  let peakDayCount = 0;
  for (const [day, count] of Object.entries(countByDay)) {
    if (count > peakDayCount) {
      peakDay = day;
      peakDayCount = count;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalAlerts: alerts.length,
    dateRange: {
      first: alerts[0]?.timestamp ?? '',
      last: alerts[alerts.length - 1]?.timestamp ?? ''
    },
    countByRegion,
    countByType,
    peakDay,
    peakDayCount,
    geocodedAlertCount: geocodedCount,
    evacuationEdgeCount
  };
}

function main(): void {
  const rawAlerts = loadRawAlerts();
  const gazetteer = loadGazetteer();

  console.log(`[112-alerts] Loaded ${rawAlerts.length} raw alerts`);
  console.log(`[112-alerts] Loaded gazetteer with ${Object.keys(gazetteer).length} entries`);

  // Sort chronologically (oldest first)
  const sorted = [...rawAlerts].sort(
    (a, b) => new Date(a.created_at_local).getTime() - new Date(b.created_at_local).getTime()
  );

  // Process each alert
  const processed = sorted.map((raw, index) => processAlert(raw, gazetteer, index));

  // Validate outputs
  const validated = processed.map((alert) => processedAlertSchema.parse(alert));
  const summary = alertsSummarySchema.parse(buildSummary(validated));

  // Write outputs
  writeJson(generatedAlertsPath, validated);
  writeJson(generatedSummaryPath, summary);

  console.log(`[112-alerts] Processed: ${validated.length} alerts`);
  console.log(`[112-alerts] Geocoded: ${summary.geocodedAlertCount}/${validated.length}`);
  console.log(`[112-alerts] Evacuation edges: ${summary.evacuationEdgeCount}`);
  console.log(`[112-alerts] Peak day: ${summary.peakDay} (${summary.peakDayCount} alerts)`);
  console.log(`[112-alerts] Regions: ${Object.entries(summary.countByRegion).map(([r, c]) => `${r}=${c}`).join(', ')}`);
  console.log(`[112-alerts] Types: ${Object.entries(summary.countByType).map(([t, c]) => `${t}=${c}`).join(', ')}`);
  console.log(`[112-alerts] Wrote ${relative(repoRoot, generatedAlertsPath)}`);
  console.log(`[112-alerts] Wrote ${relative(repoRoot, generatedSummaryPath)}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[112-alerts] ingestion failed: ${message}`);
  process.exit(1);
}
