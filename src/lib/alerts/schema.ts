import { z } from 'zod';

// ── Alert type classification ──
export const alertTypeValues = ['evacuation', 'shelter_in_place', 'fire_danger', 'general'] as const;
export const alertTypeSchema = z.enum(alertTypeValues);
export type AlertType = z.infer<typeof alertTypeSchema>;

// ── Fire region ──
export const fireRegionValues = [
  'evia',
  'attica_north',
  'attica_west',
  'attica_south',
  'messinia',
  'ilia',
  'fokida',
  'rhodes',
  'arcadia',
  'corinthia',
  'grevena',
  'other'
] as const;
export const fireRegionSchema = z.enum(fireRegionValues);
export type FireRegion = z.infer<typeof fireRegionSchema>;

// ── Gazetteer entry ──
export const gazetteerEntrySchema = z.object({
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  nameEn: z.string().min(1),
  region: z.string().min(1)
});

export const gazetteerSchema = z.record(z.string(), gazetteerEntrySchema);

export type GazetteerEntry = z.infer<typeof gazetteerEntrySchema>;
export type Gazetteer = z.infer<typeof gazetteerSchema>;

// ── Raw alert (matching the scraped tweet JSON structure) ──
export const rawAlertSchema = z.object({
  tweet_id: z.string().min(1),
  created_at_utc: z.string().min(1),
  created_at_local: z.string().min(1),
  text: z.string().min(1),
  public_metrics: z.object({
    retweet_count: z.number().int().nonnegative(),
    reply_count: z.number().int().nonnegative(),
    like_count: z.number().int().nonnegative(),
    quote_count: z.number().int().nonnegative().optional(),
    bookmark_count: z.number().int().nonnegative().optional(),
    impression_count: z.number().int().nonnegative().optional()
  }),
  entities: z.object({
    hashtags: z
      .array(
        z.object({
          start: z.number().int().nonnegative(),
          end: z.number().int().nonnegative(),
          tag: z.string().min(1)
        })
      )
      .default([]),
    mentions: z
      .array(
        z.object({
          start: z.number().int().nonnegative(),
          end: z.number().int().nonnegative(),
          username: z.string().min(1),
          id: z.string()
        })
      )
      .default([])
  }),
  source_url: z.string().min(1)
});

export type RawAlert = z.infer<typeof rawAlertSchema>;

// ── Geocoded location ──
const geocodedLocationSchema = z.object({
  tag: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  nameEn: z.string().min(1)
});

export type GeocodedLocation = z.infer<typeof geocodedLocationSchema>;

// ── Evacuation edge ──
const evacuationEdgeSchema = z.object({
  from: z.tuple([z.number(), z.number()]),
  to: z.tuple([z.number(), z.number()])
});

// ── Processed alert (output of ingestion pipeline) ──
export const processedAlertSchema = z.object({
  tweetId: z.string().min(1),
  timestamp: z.string().min(1),
  timestampUtc: z.string().min(1),
  chronologicalIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
  alertType: alertTypeSchema,
  fireRegion: z.string().min(1),
  fromLocations: z.array(geocodedLocationSchema),
  toLocations: z.array(geocodedLocationSchema),
  centroid: z.tuple([z.number(), z.number()]).nullable(),
  evacuationEdges: z.array(evacuationEdgeSchema),
  engagement: z.object({
    retweets: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative(),
    replies: z.number().int().nonnegative()
  }),
  sourceUrl: z.string().min(1)
});

export type ProcessedAlert = z.infer<typeof processedAlertSchema>;

// ── Summary stats ──
export const alertsSummarySchema = z.object({
  generatedAt: z.string().datetime(),
  totalAlerts: z.number().int().nonnegative(),
  dateRange: z.object({
    first: z.string().min(1),
    last: z.string().min(1)
  }),
  countByRegion: z.record(z.string(), z.number().int().nonnegative()),
  countByType: z.record(z.string(), z.number().int().nonnegative()),
  peakDay: z.string().min(1),
  peakDayCount: z.number().int().nonnegative(),
  geocodedAlertCount: z.number().int().nonnegative(),
  evacuationEdgeCount: z.number().int().nonnegative()
});

export type AlertsSummary = z.infer<typeof alertsSummarySchema>;
