import { categoryValues } from '@/lib/data/schemas';
import { getCategoryLabel } from './categories';
import type { TimelineEvent } from './types';

const queryKeys = {
  event: 'event',
  category: 'category',
  actors: 'actors',
  places: 'places',
  tags: 'tags',
  from: 'from',
  to: 'to'
} as const;

const dateInputPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const categorySet = new Set<string>(categoryValues);

export type TimelineFilterState = {
  categories: TimelineEvent['category'][];
  actors: string[];
  places: string[];
  tags: string[];
  from: string | null;
  to: string | null;
};

export type TimelineQueryState = {
  eventId: string | null;
  filters: TimelineFilterState;
};

export type TimelineFilterOption<TId extends string = string> = {
  id: TId;
  label: string;
  count: number;
};

export type TimelineFilterOptions = {
  categories: TimelineFilterOption<TimelineEvent['category']>[];
  actors: TimelineFilterOption[];
  places: TimelineFilterOption[];
  tags: TimelineFilterOption[];
  minDate: string | null;
  maxDate: string | null;
};

function isCategory(value: string): value is TimelineEvent['category'] {
  return categorySet.has(value);
}

function parseCsvList(input: string | null): string[] {
  if (!input) {
    return [];
  }

  return [...new Set(input.split(',').map((item) => item.trim()).filter(Boolean))];
}

function toCsvList(values: readonly string[]): string {
  return [...values].sort((a, b) => a.localeCompare(b)).join(',');
}

function toDateInputValue(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function parseDateInput(value: string | null, endBoundary: boolean): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(dateInputPattern);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return null;
  }

  const validationDate = new Date(Date.UTC(year, monthIndex, day));
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== monthIndex ||
    validationDate.getUTCDate() !== day
  ) {
    return null;
  }

  return Date.UTC(year, monthIndex, day, endBoundary ? 23 : 0, endBoundary ? 59 : 0, endBoundary ? 59 : 0);
}

function normalizeDateInput(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!dateInputPattern.test(trimmed) || parseDateInput(trimmed, false) === null) {
    return null;
  }

  return trimmed;
}

export function createEmptyFilters(): TimelineFilterState {
  return {
    categories: [],
    actors: [],
    places: [],
    tags: [],
    from: null,
    to: null
  };
}

export function hasActiveFilters(filters: TimelineFilterState): boolean {
  return (
    filters.categories.length > 0 ||
    filters.actors.length > 0 ||
    filters.places.length > 0 ||
    filters.tags.length > 0 ||
    Boolean(filters.from) ||
    Boolean(filters.to)
  );
}

export function readTimelineQuery(search: string): TimelineQueryState {
  const params = new URLSearchParams(search);

  const categories = parseCsvList(params.get(queryKeys.category)).filter(isCategory);

  return {
    eventId: params.get(queryKeys.event) ?? null,
    filters: {
      categories,
      actors: parseCsvList(params.get(queryKeys.actors)),
      places: parseCsvList(params.get(queryKeys.places)),
      tags: parseCsvList(params.get(queryKeys.tags)),
      from: normalizeDateInput(params.get(queryKeys.from)),
      to: normalizeDateInput(params.get(queryKeys.to))
    }
  };
}

export function buildTimelineQuery(state: TimelineQueryState): string {
  const params = new URLSearchParams();

  if (state.eventId) {
    params.set(queryKeys.event, state.eventId);
  }

  if (state.filters.categories.length > 0) {
    params.set(queryKeys.category, toCsvList(state.filters.categories));
  }
  if (state.filters.actors.length > 0) {
    params.set(queryKeys.actors, toCsvList(state.filters.actors));
  }
  if (state.filters.places.length > 0) {
    params.set(queryKeys.places, toCsvList(state.filters.places));
  }
  if (state.filters.tags.length > 0) {
    params.set(queryKeys.tags, toCsvList(state.filters.tags));
  }
  if (state.filters.from) {
    params.set(queryKeys.from, state.filters.from);
  }
  if (state.filters.to) {
    params.set(queryKeys.to, state.filters.to);
  }

  return params.toString();
}

export function deriveFilterOptions(events: TimelineEvent[]): TimelineFilterOptions {
  const categoryOrder = new Map(categoryValues.map((value, index) => [value, index]));
  const categoryCount = new Map<TimelineEvent['category'], number>();
  const actorCount = new Map<string, TimelineFilterOption>();
  const placeCount = new Map<string, TimelineFilterOption>();
  const tagCount = new Map<string, TimelineFilterOption>();

  let minTs: number | null = null;
  let maxTs: number | null = null;

  for (const event of events) {
    categoryCount.set(event.category, (categoryCount.get(event.category) ?? 0) + 1);

    for (const actor of event.actorLabels) {
      const current = actorCount.get(actor.id);
      if (current) {
        current.count += 1;
      } else {
        actorCount.set(actor.id, { id: actor.id, label: actor.name, count: 1 });
      }
    }

    for (const place of event.placeLabels) {
      const current = placeCount.get(place.id);
      if (current) {
        current.count += 1;
      } else {
        placeCount.set(place.id, { id: place.id, label: place.name, count: 1 });
      }
    }

    for (const tag of event.tags) {
      const current = tagCount.get(tag);
      if (current) {
        current.count += 1;
      } else {
        tagCount.set(tag, { id: tag, label: tag, count: 1 });
      }
    }

    const eventStart = event.startTs;
    const eventEnd = event.endTs ?? event.startTs;
    minTs = minTs === null ? eventStart : Math.min(minTs, eventStart);
    maxTs = maxTs === null ? eventEnd : Math.max(maxTs, eventEnd);
  }

  const categories = [...categoryCount.entries()]
    .sort((a, b) => (categoryOrder.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(b[0]) ?? Number.MAX_SAFE_INTEGER))
    .map(([id, count]) => ({
      id,
      label: getCategoryLabel(id),
      count
    }));

  const actors = [...actorCount.values()].sort((a, b) => a.label.localeCompare(b.label));
  const places = [...placeCount.values()].sort((a, b) => a.label.localeCompare(b.label));
  const tags = [...tagCount.values()].sort((a, b) => a.label.localeCompare(b.label));

  return {
    categories,
    actors,
    places,
    tags,
    minDate: minTs === null ? null : toDateInputValue(minTs),
    maxDate: maxTs === null ? null : toDateInputValue(maxTs)
  };
}

function includesAny(haystack: string[], needles: string[]): boolean {
  if (needles.length === 0) {
    return true;
  }

  const lookup = new Set(haystack);
  for (const value of needles) {
    if (lookup.has(value)) {
      return true;
    }
  }

  return false;
}

export function filterTimelineEvents(events: TimelineEvent[], filters: TimelineFilterState): TimelineEvent[] {
  const fromTs = parseDateInput(filters.from, false);
  const toTs = parseDateInput(filters.to, true);

  if (fromTs !== null && toTs !== null && fromTs > toTs) {
    return [];
  }

  return events.filter((event) => {
    if (filters.categories.length > 0 && !filters.categories.includes(event.category)) {
      return false;
    }

    if (!includesAny(event.actors, filters.actors)) {
      return false;
    }

    if (!includesAny(event.places, filters.places)) {
      return false;
    }

    if (!includesAny(event.tags, filters.tags)) {
      return false;
    }

    const eventStart = event.startTs;
    const eventEnd = event.endTs ?? event.startTs;

    if (fromTs !== null && eventEnd < fromTs) {
      return false;
    }
    if (toTs !== null && eventStart > toTs) {
      return false;
    }

    return true;
  });
}

function sanitizeIdSelection<TId extends string>(selectedIds: TId[], options: TimelineFilterOption<TId>[]): TId[] {
  const allowed = new Set(options.map((option) => option.id));
  return selectedIds.filter((id) => allowed.has(id));
}

export function sanitizeFilters(filters: TimelineFilterState, options: TimelineFilterOptions): TimelineFilterState {
  return {
    categories: sanitizeIdSelection(filters.categories, options.categories).filter(isCategory),
    actors: sanitizeIdSelection(filters.actors, options.actors),
    places: sanitizeIdSelection(filters.places, options.places),
    tags: sanitizeIdSelection(filters.tags, options.tags),
    from: normalizeDateInput(filters.from),
    to: normalizeDateInput(filters.to)
  };
}
