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

// ── Cache layer ──
// In-memory cache for View Transitions (SPA nav).
// sessionStorage backup for full page reloads (archive → timeline).

const STORAGE_KEY = 'tl-cache-v1';
let _cache: TimelineResources | null = null;

function loadFromStorage(): TimelineResources | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      events: toTimelineEvents(parsed.events),
      sourcesById: sourceLookupSchema.parse(parsed.sources),
      mediaById: mediaLookupSchema.parse(parsed.media),
    };
  } catch {
    return null;
  }
}

function saveToStorage(eventsRaw: unknown, sourcesRaw: unknown, mediaRaw: unknown): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      events: eventsRaw,
      sources: sourcesRaw,
      media: mediaRaw,
    }));
  } catch {
    // storage full — ignore
  }
}

/** Synchronous access to cached data (null if not yet loaded) */
export function getCachedTimelineResources(): TimelineResources | null {
  if (_cache) return _cache;
  _cache = loadFromStorage();
  return _cache;
}

export async function fetchTimelineResources(signal?: AbortSignal): Promise<TimelineResources> {
  if (_cache) return _cache;

  // Try sessionStorage first (survives full page reloads)
  const stored = loadFromStorage();
  if (stored) {
    _cache = stored;
    return _cache;
  }

  const [eventsRaw, sourcesRaw, mediaRaw] = await Promise.all([
    fetchJson('/data/events.index.json', signal),
    fetchJson('/data/sources.json', signal),
    fetchJson('/data/media.json', signal)
  ]);

  // Save raw data to sessionStorage for next full reload
  saveToStorage(eventsRaw, sourcesRaw, mediaRaw);

  _cache = {
    events: toTimelineEvents(eventsRaw),
    sourcesById: sourceLookupSchema.parse(sourcesRaw),
    mediaById: mediaLookupSchema.parse(mediaRaw)
  };

  return _cache;
}
