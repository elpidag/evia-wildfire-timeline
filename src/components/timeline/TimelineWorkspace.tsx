import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TimelineSelectionContext,
  buildTimelineQuery,
  createEmptyFilters,
  deriveFilterOptions,
  fetchTimelineResources,
  filterTimelineEvents,
  getCachedTimelineResources,
  readTimelineQuery,
  sanitizeFilters,
  type MediaLookup,
  type SourceLookup,
  type TimelineEvent,
  type TimelineFilterState
} from '@/lib/timeline';
import D3Timeline from './D3Timeline';
import EventDetailCard from './EventDetailCard';
import TimelineLegend from './TimelineLegend';

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

function filtersEqual(a: TimelineFilterState, b: TimelineFilterState): boolean {
  return (
    arraysEqual(a.categories, b.categories) &&
    arraysEqual(a.actors, b.actors) &&
    arraysEqual(a.places, b.places) &&
    arraysEqual(a.tags, b.tags) &&
    a.from === b.from &&
    a.to === b.to
  );
}

export type TimelineDisplayOptions = {
  hideLabels?: boolean;
  hideFireSeasons?: boolean;
  allPointsOnDivider?: boolean;
  /** Hide fire/suppression/flood events entirely */
  hideFireEvents?: boolean;
  /** Place point event symbols above the divider line instead of centered on it */
  pointsAboveDivider?: boolean;
  /** Hide all duration events, show only point events */
  hideDurationEvents?: boolean;
  /** Force a compact timeline height (px) — just the divider line area */
  compactTimelineHeight?: number;
  /** If set, only show these categories in the legend */
  legendCategories?: string[];
  /** Place legend above the timeline instead of below */
  legendAbove?: boolean;
  /** Year multiples that get solid grid lines; all others are dotted */
  solidYearMultiple?: number;
};

type WorkspaceProps = {
  focusDomain?: [string, string];
  initialDomain?: [string, string];
  highlightedIds?: string[];
  displayOptions?: TimelineDisplayOptions;
};

export default function TimelineWorkspace({ focusDomain, initialDomain, highlightedIds, displayOptions }: WorkspaceProps = {}) {
  // Initialize from cache synchronously to avoid "Loading" flash on subsequent navigations
  const cached = getCachedTimelineResources();
  const [events, setEvents] = useState<TimelineEvent[]>(cached?.events ?? []);
  const [filters, setFilters] = useState<TimelineFilterState>(() => createEmptyFilters());
  const [sourcesById, setSourcesById] = useState<SourceLookup>(cached?.sourcesById ?? {});
  const [mediaById, setMediaById] = useState<MediaLookup>(cached?.mediaById ?? {});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!cached);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasReadUrlState = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || hasReadUrlState.current) {
      return;
    }

    const queryState = readTimelineQuery(window.location.search);
    setFilters(queryState.filters);
    setSelectedEventId(queryState.eventId);
    hasReadUrlState.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      const queryState = readTimelineQuery(window.location.search);
      setFilters(queryState.filters);
      setSelectedEventId(queryState.eventId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load(): Promise<void> {
      try {
        const resources = await fetchTimelineResources(controller.signal);
        if (controller.signal.aborted) {
          return;
        }

        setEvents(resources.events);
        setSourcesById(resources.sourcesById);
        setMediaById(resources.mediaById);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown timeline load error.';
        setErrorMessage(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, []);

  const filterOptions = useMemo(() => deriveFilterOptions(events), [events]);

  useEffect(() => {
    setFilters((current) => {
      const next = sanitizeFilters(current, filterOptions);
      return filtersEqual(current, next) ? current : next;
    });
  }, [filterOptions]);

  const filteredEvents = useMemo(() => filterTimelineEvents(events, filters), [events, filters]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    setSelectedEventId((previous) => {
      if (filteredEvents.length === 0) {
        return null;
      }

      if (previous && filteredEvents.some((event) => event.id === previous)) {
        return previous;
      }

      return null;
    });
  }, [filteredEvents, isLoading]);

  useEffect(() => {
    if (typeof window === 'undefined' || isLoading || !hasReadUrlState.current) {
      return;
    }

    const nextQuery = buildTimelineQuery({ eventId: selectedEventId, filters });
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [filters, isLoading, selectedEventId]);

  const highlightedSet = useMemo(
    () => (highlightedIds ? new Set(highlightedIds) : undefined),
    [highlightedIds]
  );

  const highlightedEvents = useMemo(
    () => highlightedIds
      ? highlightedIds
          .map((id) => filteredEvents.find((e) => e.id === id))
          .filter((e): e is TimelineEvent => e != null)
      : [],
    [filteredEvents, highlightedIds]
  );

  const selectedEvent = useMemo(
    () => filteredEvents.find((event) => event.id === selectedEventId) ?? null,
    [filteredEvents, selectedEventId]
  );

  const selectionState = useMemo(
    () => ({
      events: filteredEvents,
      selectedEventId,
      selectedEvent,
      setSelectedEventId
    }),
    [filteredEvents, selectedEvent, selectedEventId]
  );

  if (isLoading) {
    return (
      <section className="timeline-placeholder" aria-live="polite">
        <h2>Loading timeline data</h2>
        <p>Reading compiled research events and references from `/data/*` artifacts.</p>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="timeline-placeholder" aria-live="assertive">
        <h2>Timeline data unavailable</h2>
        <p>{errorMessage}</p>
      </section>
    );
  }

  const legendAbove = displayOptions?.legendAbove ?? false;

  // Is the selected event different from the highlighted ones?
  const showSelectedOverlay = selectedEvent && highlightedSet && !highlightedSet.has(selectedEvent.id);

  return (
    <TimelineSelectionContext.Provider value={selectionState}>
      <section className="timeline-workspace" aria-label="Timeline workspace">
        {legendAbove && (
          <div className="timeline-top-row">
            <TimelineLegend events={filteredEvents} displayOptions={displayOptions} />
            {showSelectedOverlay && (
              <div className="timeline-selected-overlay">
                <EventDetailCard event={selectedEvent} />
              </div>
            )}
          </div>
        )}
        <D3Timeline
          events={filteredEvents}
          selectedEventId={selectedEventId}
          onSelectEvent={(eventId) => setSelectedEventId(eventId)}
          focusDomain={focusDomain}
          initialDomain={initialDomain}
          highlightedIds={highlightedSet}
          displayOptions={displayOptions}
          selectedOverlay={!legendAbove && showSelectedOverlay ? <EventDetailCard event={selectedEvent} /> : null}
        />
        <div className="timeline-bottom-row">
          {!legendAbove && <TimelineLegend events={filteredEvents} displayOptions={displayOptions} />}
          {highlightedEvents.length > 0
            ? highlightedEvents.map((ev) => <EventDetailCard key={ev.id} event={ev} />)
            : !showSelectedOverlay && selectedEvent && <EventDetailCard event={selectedEvent} />}
        </div>
      </section>
    </TimelineSelectionContext.Provider>
  );
}