import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  TimelineSelectionContext,
  buildTimelineQuery,
  createEmptyFilters,
  deriveFilterOptions,
  fetchTimelineResources,
  filterTimelineEvents,
  readTimelineQuery,
  sanitizeFilters,
  type MediaLookup,
  type SourceLookup,
  type TimelineEvent,
  type TimelineFilterState
} from '@/lib/timeline';
import D3Timeline from './D3Timeline';
import EventDetailPanel from './EventDetailPanel';
import TimelineLegend from './TimelineLegend';

const LazyEventMapPanel = lazy(() => import('./EventMapPanel'));

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

export default function TimelineWorkspace() {
  const showMap = false;
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filters, setFilters] = useState<TimelineFilterState>(() => createEmptyFilters());
  const [sourcesById, setSourcesById] = useState<SourceLookup>({});
  const [mediaById, setMediaById] = useState<MediaLookup>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  return (
    <TimelineSelectionContext.Provider value={selectionState}>
      <section className="timeline-workspace" aria-label="Timeline workspace">
        <div className="detail-slot" aria-live="polite">
          {selectedEvent ? (
            <EventDetailPanel selectedEvent={selectedEvent} sourcesById={sourcesById} mediaById={mediaById} />
          ) : null}
        </div>

        <D3Timeline
          events={filteredEvents}
          selectedEventId={selectedEventId}
          onSelectEvent={(eventId) => setSelectedEventId(eventId)}
        />

        <div className={`workspace-panels ${showMap ? '' : 'is-map-hidden'}`.trim()} aria-label="Legend and map panels">
          <TimelineLegend events={filteredEvents} />
          {showMap ? (
            <Suspense
              fallback={
                <section className="map-panel" aria-label="Map panel loading state" aria-live="polite">
                  <p>Loading map module...</p>
                </section>
              }
            >
              <LazyEventMapPanel selectedEvent={selectedEvent} events={filteredEvents} />
            </Suspense>
          ) : null}
        </div>
      </section>
    </TimelineSelectionContext.Provider>
  );
}
