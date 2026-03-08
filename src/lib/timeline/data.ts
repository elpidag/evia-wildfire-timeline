import {
  compiledEventsSchema,
  mediaLookupSchema,
  sourceLookupSchema,
  type MediaLookup,
  type SourceLookup,
  type TimelineEvent
} from './types';

export type TimelineResources = {
  events: TimelineEvent[];
  sourcesById: SourceLookup;
  mediaById: MediaLookup;
};

export function toTimelineEvents(raw: unknown): TimelineEvent[] {
  const parsed = compiledEventsSchema.parse(raw);

  return parsed
    .map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      summary: event.summary,
      body: event.body,
      category: event.category,
      actors: event.actors,
      places: event.places,
      tags: event.tags,
      startTs: event.startTs,
      endTs: event.endTs,
      isDuration: Boolean(event.endTs) || event.isOngoing,
      displayDate: event.displayDate,
      datePrecision: event.datePrecision,
      featured: event.featured,
      sourceRefs: event.sourceRefs,
      imageRefs: event.imageRefs,
      coverImage: event.coverImage,
      actorLabels: event.actorLabels,
      placeLabels: event.placeLabels,
      mapViewport: event.mapViewport,
      geometry: event.geometry
    }))
    .sort((a, b) => {
      if (a.startTs !== b.startTs) {
        return a.startTs - b.startTs;
      }
      return a.id.localeCompare(b.id);
    });
}

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchTimelineResources(signal?: AbortSignal): Promise<TimelineResources> {
  const [eventsRaw, sourcesRaw, mediaRaw] = await Promise.all([
    fetchJson('/data/events.index.json', signal),
    fetchJson('/data/sources.json', signal),
    fetchJson('/data/media.json', signal)
  ]);

  return {
    events: toTimelineEvents(eventsRaw),
    sourcesById: sourceLookupSchema.parse(sourcesRaw),
    mediaById: mediaLookupSchema.parse(mediaRaw)
  };
}
