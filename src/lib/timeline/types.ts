import { z } from 'zod';
import {
  categoryValues,
  datePrecisionValues,
  mediaReferenceSchema,
  sourceReferenceSchema
} from '@/lib/data/schemas';

export const compiledEventSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().default(''),
  category: z.enum(categoryValues),
  start: z.string().min(4),
  end: z.string().nullable().optional(),
  actors: z.array(z.string().min(1)).default([]),
  places: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  datePrecision: z.enum(datePrecisionValues),
  isOngoing: z.boolean(),
  displayDate: z.string().min(1),
  startTs: z.number(),
  endTs: z.number().nullable(),
  featured: z.boolean().default(false),
  sourceRefs: z.array(z.string().min(1)).default([]),
  imageRefs: z.array(z.string().min(1)).default([]),
  coverImage: z.string().nullable().optional(),
  actorLabels: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      slug: z.string().min(1)
    })
  ),
  placeLabels: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      slug: z.string().min(1)
    })
  ),
  mapViewport: z
    .object({
      center: z.tuple([z.number(), z.number()]),
      zoom: z.number()
    })
    .optional(),
  geometry: z
    .object({
      type: z.string(),
      coordinates: z.unknown()
    })
    .optional()
});

export const compiledEventsSchema = z.array(compiledEventSchema);
export const sourceLookupSchema = z.record(sourceReferenceSchema);
export const mediaLookupSchema = z.record(mediaReferenceSchema);

export type CompiledEvent = z.infer<typeof compiledEventSchema>;
export type SourceLookup = z.infer<typeof sourceLookupSchema>;
export type MediaLookup = z.infer<typeof mediaLookupSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type MediaReference = z.infer<typeof mediaReferenceSchema>;

export type TimelineEvent = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: CompiledEvent['category'];
  actors: string[];
  places: string[];
  tags: string[];
  startTs: number;
  endTs: number | null;
  isDuration: boolean;
  displayDate: string;
  datePrecision: CompiledEvent['datePrecision'];
  featured: boolean;
  sourceRefs: string[];
  imageRefs: string[];
  coverImage?: string | null;
  actorLabels: CompiledEvent['actorLabels'];
  placeLabels: CompiledEvent['placeLabels'];
  mapViewport?: CompiledEvent['mapViewport'];
  geometry?: CompiledEvent['geometry'];
};

export type TimelineTickSpec = {
  majorTicks: Date[];
  minorTicks: Date[];
  dailyTicks: Date[];
  formatMajor: (date: Date) => string;
};

export type LaneEvent = TimelineEvent & {
  laneIndex: number;
  categoryIndex: number;
  laneY: number;
  laneHeight: number;
};

export type CategoryLane = {
  category: TimelineEvent['category'];
  categoryIndex: number;
  y: number;
  height: number;
  subLaneCount: number;
};
