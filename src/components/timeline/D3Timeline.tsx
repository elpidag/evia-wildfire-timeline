import {
  select,
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type Selection,
  type ZoomBehavior,
  type ZoomTransform
} from 'd3';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  getCategoryLabel,
  resolveEventIcon,
} from '@/lib/timeline/categories';
import { buildTickSpec, createBaseTimeScale } from '@/lib/timeline/ticks';
import type { TimelineEvent } from '@/lib/timeline/types';
import { useElementSize } from '@/lib/utils';
import type { TimelineDisplayOptions } from './TimelineWorkspace';

type D3TimelineProps = {
  events: TimelineEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  /** Optional focused date range [start, end] as ISO strings. Locks zoom/pan. */
  focusDomain?: [string, string];
  /** Optional initial date range [start, end]. Sets starting view but allows zoom/pan. */
  initialDomain?: [string, string];
  /** Event IDs to visually highlight (scale 1.5×) on focused pages. */
  highlightedIds?: Set<string>;
  displayOptions?: TimelineDisplayOptions;
  /** Optional overlay rendered inside the timeline card (top-left) */
  selectedOverlay?: React.ReactNode;
};

type BandId = 'evia' | 'attica' | 'rest';

type PositionedEvent = TimelineEvent & {
  band: BandId;
  laneIndex: number;
  y: number;
  laneH: number;
};

type BandInfo = {
  id: BandId;
  label: string;
  laneCount: number;
  bandHeight: number;
  topY: number;
};

type BandLayout = {
  events: PositionedEvent[];
  bands: BandInfo[];
  dividers: number[];
  height: number;
  /** Top Y of Evia lane 0 (fire lane) — used to position point events */
  eviaFireLaneTopY: number;
  /** Bottom Y of Attica lane 0 (fire lane) — used to position point events */
  atticaFireLaneBottomY: number;
};

type PlotSelection = Selection<SVGSVGElement, unknown, null, undefined>;

type FireSeason = {
  id: string;
  startTs: number;
  endTs: number;
};

const margin = {
  top: 38,
  right: 18,
  bottom: 28,
  left: 26
};

const minimumInnerWidth = 680;
const defaultLaneHeight = 24;
const eviaLaneHeight = 56;
const pointIconSize = 16;
const laneGap = 4;
const pointCollisionMs = 86_400_000;
const eventMinWidth = 6;

// Fixed domain: 1 Jan 2021 → 18 Mar 2026.
// Changing this is the single source of truth for the visible time range.
const FIXED_DOMAIN: [Date, Date] = [
  new Date(Date.UTC(2021, 0, 1)),
  new Date(Date.UTC(2026, 2, 18))
];

function getEventEndTs(event: TimelineEvent): number {
  if (event.endTs) {
    return event.endTs;
  }

  return event.startTs + pointCollisionMs;
}

function classifyBand(event: TimelineEvent): BandId {
  if (event.places.some((p) => /evia/i.test(p))) return 'evia';
  if (event.places.some((p) => /attic/i.test(p))) return 'attica';
  return 'rest';
}

const environmentalCategories = new Set(['wildfire', 'suppression', 'flood']);

function packBand(
  events: TimelineEvent[],
  band: BandId
): Array<TimelineEvent & { laneIndex: number; band: BandId }> {
  const sorted = [...events].sort((a, b) => {
    if (a.startTs !== b.startTs) {
      return a.startTs - b.startTs;
    }

    const aEnd = getEventEndTs(a);
    const bEnd = getEventEndTs(b);
    if (aEnd !== bEnd) {
      return bEnd - aEnd;
    }

    return a.id.localeCompare(b.id);
  });

  // Evia & Attica: pack environmental events (fire/suppression/flood) normally,
  // then put all other events on a single shared lane.
  if (band === 'evia' || band === 'attica') {
    const envEvents = sorted.filter((e) => environmentalCategories.has(e.category));
    const otherEvents = sorted.filter((e) => !environmentalCategories.has(e.category));

    const laneEndTs: number[] = [];
    const result: Array<TimelineEvent & { laneIndex: number; band: BandId }> = [];

    for (const event of envEvents) {
      const eventEndTs = getEventEndTs(event);
      let laneIndex = laneEndTs.findIndex((laneEnd) => laneEnd <= event.startTs);
      if (laneIndex === -1) {
        laneIndex = laneEndTs.length;
        laneEndTs.push(eventEndTs);
      } else {
        laneEndTs[laneIndex] = eventEndTs;
      }
      result.push({ ...event, laneIndex, band });
    }

    // Non-environmental duration events: own lanes right after environmental
    const pointEvents = otherEvents.filter((e) => !e.endTs || e.endTs === e.startTs);
    const durationEvents = otherEvents.filter((e) => e.endTs && e.endTs !== e.startTs);

    // Spatial planning and forestry service events each share one lane (overlap allowed)
    const spatialEvents = durationEvents.filter((e) => isSpatialPlanning(e));
    const forestryEvents = durationEvents.filter((e) => e.slug === 'works-by-the-forestry-service');
    const otherDurationEvents = durationEvents.filter(
      (e) => !isSpatialPlanning(e) && e.slug !== 'works-by-the-forestry-service'
    );

    const durBaseLane = laneEndTs.length;
    let nextDurLane = 0;

    if (spatialEvents.length > 0) {
      for (const event of spatialEvents) {
        result.push({ ...event, laneIndex: durBaseLane + nextDurLane, band });
      }
      nextDurLane += 1;
    }

    if (forestryEvents.length > 0) {
      for (const event of forestryEvents) {
        result.push({ ...event, laneIndex: durBaseLane + nextDurLane, band });
      }
      nextDurLane += 1;
    }

    const durLaneEndTs: number[] = [];
    for (const event of otherDurationEvents) {
      const eventEndTs = getEventEndTs(event);
      let subLane = durLaneEndTs.findIndex((laneEnd) => laneEnd <= event.startTs);
      if (subLane === -1) {
        subLane = durLaneEndTs.length;
        durLaneEndTs.push(eventEndTs);
      } else {
        durLaneEndTs[subLane] = eventEndTs;
      }
      result.push({ ...event, laneIndex: durBaseLane + nextDurLane + subLane, band });
    }

    // Point events: pack on lanes right after duration events
    const pointBaseLane = durBaseLane + nextDurLane + durLaneEndTs.length;
    const pointLaneEndTs: number[] = [];
    for (const event of pointEvents) {
      const eventEndTs = getEventEndTs(event);
      let subLane = pointLaneEndTs.findIndex((laneEnd) => laneEnd <= event.startTs);
      if (subLane === -1) {
        subLane = pointLaneEndTs.length;
        pointLaneEndTs.push(eventEndTs);
      } else {
        pointLaneEndTs[subLane] = eventEndTs;
      }
      result.push({ ...event, laneIndex: pointBaseLane + subLane, band });
    }

    return result;
  }

  // Default packing for other bands
  const laneEndTs: number[] = [];

  return sorted.map((event) => {
    const eventEndTs = getEventEndTs(event);
    let laneIndex = laneEndTs.findIndex((laneEnd) => laneEnd <= event.startTs);

    if (laneIndex === -1) {
      laneIndex = laneEndTs.length;
      laneEndTs.push(eventEndTs);
    } else {
      laneEndTs[laneIndex] = eventEndTs;
    }

    return {
      ...event,
      laneIndex,
      band
    };
  });
}

const bandDefs: { id: BandId; label: string; laneHeight: number }[] = [
  { id: 'evia', label: 'EVIA', laneHeight: eviaLaneHeight },
  { id: 'attica', label: 'ATTICA', laneHeight: defaultLaneHeight },
  { id: 'rest', label: 'REST OF GREECE', laneHeight: defaultLaneHeight },
];


function computeBandLayout(events: TimelineEvent[]): BandLayout {
  const grouped: Record<BandId, TimelineEvent[]> = { evia: [], attica: [], rest: [] };
  for (const e of events) {
    grouped[classifyBand(e)].push(e);
  }

  const packed = bandDefs.map((def) => ({
    def,
    events: packBand(grouped[def.id], def.id),
  }));

  const laneCounts = packed.map(
    (b) => Math.max(1, b.events.reduce((mx, e) => Math.max(mx, e.laneIndex + 1), 0))
  );

  // Compute per-lane heights:
  // - Environmental lanes in Evia use eviaLaneHeight
  // - Non-env duration lanes use defaultLaneHeight
  // - Non-env point-only lanes in Evia/Attica use compact height (positioned at fire lane edge)
  const compactLaneHeight = 0;
  const perLaneHeights: number[][] = packed.map((b, bi) => {
    const lc = laneCounts[bi];
    if (b.def.id === 'rest') {
      return Array(lc).fill(defaultLaneHeight) as number[];
    }
    const laneHasEnv = new Set<number>();
    const laneHasDuration = new Set<number>();
    for (const e of b.events) {
      if (environmentalCategories.has(e.category)) laneHasEnv.add(e.laneIndex);
      if (e.endTs && e.endTs !== e.startTs) laneHasDuration.add(e.laneIndex);
    }
    return Array.from({ length: lc }, (_, lane) =>
      laneHasEnv.has(lane)
        ? (b.def.id === 'evia' ? eviaLaneHeight : defaultLaneHeight)
        : laneHasDuration.has(lane)
          ? defaultLaneHeight
          : compactLaneHeight
    );
  });

  // Compute cumulative Y offsets per lane within each band
  const laneYOffsets: number[][] = perLaneHeights.map((heights) => {
    const offsets: number[] = [];
    let y = 0;
    for (let i = 0; i < heights.length; i++) {
      offsets.push(y);
      y += heights[i] + laneGap;
    }
    return offsets;
  });

  const bandHeights = perLaneHeights.map((heights) =>
    heights.reduce((sum, h) => sum + h, 0) + Math.max(0, heights.length - 1) * laneGap
  );

  // Compute top-Y for each band. No gaps between bands.
  const topYs: number[] = [];
  let cursor = 0;
  for (let i = 0; i < bandDefs.length; i++) {
    topYs.push(cursor);
    cursor += bandHeights[i];
  }

  const totalHeight = cursor;

  // Divider Y positions: each divider sits at the bottom edge of the upper band.
  const dividers: number[] = [];
  dividers.push(topYs[0] + bandHeights[0]); // Evia/Attica
  if (bandDefs.length > 2) {
    dividers.push(topYs[1] + bandHeights[1]); // Attica/Rest
  }

  const bands: BandInfo[] = bandDefs.map((def, i) => ({
    id: def.id,
    label: def.label,
    laneCount: laneCounts[i],
    bandHeight: bandHeights[i],
    topY: topYs[i],
  }));

  const positionedEvents: PositionedEvent[] = packed.flatMap((b, bi) => {
    const offsets = laneYOffsets[bi];

    return b.events.map((event) => ({
      ...event,
      laneH: perLaneHeights[bi][event.laneIndex],
      // Evia: reverse lanes so lane 0 (fire/suppression) sits at the bottom, near the divider
      y: b.def.id === 'evia'
        ? topYs[bi] + (bandHeights[bi] - offsets[event.laneIndex] - perLaneHeights[bi][event.laneIndex])
        : topYs[bi] + offsets[event.laneIndex],
    }));
  });

  // Evia lane 0 top Y (reversed): top edge of the fire lane
  const eviaFireLaneTopY = topYs[0] + (bandHeights[0] - laneYOffsets[0][0] - perLaneHeights[0][0]);

  // Attica lane 0 bottom Y (not reversed): bottom edge of the fire lane
  const atticaFireLaneBottomY = topYs[1] + laneYOffsets[1][0] + perLaneHeights[1][0];

  return {
    events: positionedEvents,
    bands,
    dividers,
    height: totalHeight,
    eviaFireLaneTopY,
    atticaFireLaneBottomY,
  };
}

function buildFireSeasons(domain: [Date, Date]): FireSeason[] {
  const minYear = domain[0].getUTCFullYear() - 1;
  const maxYear = domain[1].getUTCFullYear() + 1;
  const minTs = domain[0].getTime();
  const maxTs = domain[1].getTime();

  const seasons: FireSeason[] = [];

  for (let year = minYear; year <= maxYear; year += 1) {
    const startTs = Date.UTC(year, 3, 30, 0, 0, 0);
    const endTs = Date.UTC(year, 9, 30, 23, 59, 59);

    if (endTs < minTs || startTs > maxTs) {
      continue;
    }

    seasons.push({
      id: String(year),
      startTs,
      endTs
    });
  }

  return seasons;
}

function buildLabelVisibility(
  events: PositionedEvent[],
): Map<string, boolean> {
  const labels = new Map<string, boolean>();
  const alwaysShow = new Set(['wildfire', 'flood']);
  for (const event of events) {
    labels.set(event.id, alwaysShow.has(event.category));
  }
  return labels;
}

function truncateLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) {
    return label;
  }

  return `${label.slice(0, maxChars - 1)}...`;
}

const ICON_BASE = '/images/legend/';

function isSpatialPlanning(event: TimelineEvent): boolean {
  return event.summary.includes('Special Urban Planning');
}

/** Years that get solid grid lines on focus-4 (5-year multiples from 1965-2020) */
const SOLID_YEARS = new Set([1965, 1970, 1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020]);

export default function D3Timeline({ events, selectedEventId, onSelectEvent, focusDomain, initialDomain, highlightedIds, displayOptions, selectedOverlay }: D3TimelineProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const clipId = useId().replace(/:/g, '-');
  const { width, height: hostHeight } = useElementSize(hostRef, { width: 0, height: 0 });

  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  const hasEvents = events.length > 0;
  const layout = useMemo(() => computeBandLayout(events), [events]);

  const hideLabels = displayOptions?.hideLabels ?? false;
  const hideFireSeasons = displayOptions?.hideFireSeasons ?? false;
  const allPointsOnDivider = displayOptions?.allPointsOnDivider ?? false;
  const solidYearMultiple = displayOptions?.solidYearMultiple;
  const hideFireEvents = displayOptions?.hideFireEvents ?? false;
  const pointsAboveDivider = displayOptions?.pointsAboveDivider ?? false;
  const hideDurationEvents = displayOptions?.hideDurationEvents ?? false;
  const compactTimelineHeight = displayOptions?.compactTimelineHeight;

  const minimumTimelineHeight = compactTimelineHeight ?? Math.max(220, Math.round(hostHeight));
  const timelineHeight = compactTimelineHeight ?? Math.max(layout.height, minimumTimelineHeight);
  // When compact, center the primary divider (Evia/Attica) in the visible area
  const verticalOffset = compactTimelineHeight && layout.dividers.length > 0
    ? Math.round(timelineHeight / 2 - layout.dividers[0])
    : Math.max(0, Math.round((timelineHeight - layout.height) / 2));

  const svgHeight = margin.top + timelineHeight + margin.bottom;
  const innerWidth = Math.max(minimumInnerWidth, width - margin.left - margin.right);

  const baseDomain: [Date, Date] = useMemo(() => {
    if (focusDomain) {
      return [new Date(focusDomain[0]), new Date(focusDomain[1])];
    }
    if (initialDomain) {
      return [new Date(initialDomain[0]), new Date(initialDomain[1])];
    }
    return FIXED_DOMAIN;
  }, [focusDomain, initialDomain]);

  const baseScale = useMemo(() => {
    return createBaseTimeScale(baseDomain, [0, innerWidth]);
  }, [baseDomain, innerWidth]);

  const visibleScale = useMemo(() => {
    return transform.rescaleX(baseScale);
  }, [baseScale, transform]);

  const visibleDomain = visibleScale.domain() as [Date, Date];
  const visibleSpanDays = Math.max(1, (visibleDomain[1].getTime() - visibleDomain[0].getTime()) / 86_400_000);

  const tickSpec = useMemo(() => {
    return buildTickSpec(visibleScale);
  }, [visibleScale]);

  const fireSeasons = useMemo(() => buildFireSeasons(visibleDomain), [visibleDomain]);

  useEffect(() => {
    if (!svgRef.current || innerWidth <= 0 || focusDomain) {
      return;
    }

    const behavior = zoom<SVGSVGElement, unknown>()
      .filter((event) => {
        const target = event.target as Element | null;
        if (target?.closest('.timeline-event')) {
          return false;
        }

        if (event.type === 'dblclick') {
          return false;
        }

        if (event.type === 'mousedown' && event.button !== 0) {
          return false;
        }

        return true;
      })
      .scaleExtent([1, 21])
      .translateExtent([
        [0, 0],
        [innerWidth, timelineHeight]
      ])
      .extent([
        [0, 0],
        [innerWidth, timelineHeight]
      ])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        // Discard the y component — timeline is horizontal-only.
        const { x, k } = event.transform;
        setTransform(zoomIdentity.translate(x, 0).scale(k));
      });

    zoomBehaviorRef.current = behavior;

    const svgSelection = select<SVGSVGElement, unknown>(svgRef.current);
    svgSelection.call(behavior);
    svgSelection.on('dblclick.zoom', null);

    return () => {
      svgSelection.on('.zoom', null);
    };
  }, [innerWidth, timelineHeight, focusDomain]);

  const runZoomCommand = (
    command: (selection: PlotSelection, behavior: ZoomBehavior<SVGSVGElement, unknown>) => void
  ): void => {
    const behavior = zoomBehaviorRef.current;
    const svg = svgRef.current;

    if (!behavior || !svg) {
      return;
    }

    const selection = select<SVGSVGElement, unknown>(svg);
    command(selection, behavior);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!svgRef.current || !zoomBehaviorRef.current || focusDomain) {
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      runZoomCommand((selection, behavior) => {
        selection.call(behavior.scaleBy, 1.28, [innerWidth / 2, 0]);
      });
      return;
    }

    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      runZoomCommand((selection, behavior) => {
        selection.call(behavior.scaleBy, 0.78, [innerWidth / 2, 0]);
      });
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      runZoomCommand((selection, behavior) => {
        selection.call(behavior.translateBy, 80, 0);
      });
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      runZoomCommand((selection, behavior) => {
        selection.call(behavior.translateBy, -80, 0);
      });
      return;
    }

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      runZoomCommand((selection, behavior) => {
        selection.call(behavior.transform, zoomIdentity);
      });
    }
  };

  const labelVisibility = useMemo(() => {
    return buildLabelVisibility(layout.events);
  }, [layout.events]);

  return (
    <section className={`timeline-card${compactTimelineHeight ? " compact-card" : ""}`} aria-label="Timeline engine">
      <div
        className={`timeline-host${compactTimelineHeight ? " compact-host" : ""}`}
        ref={hostRef}
        tabIndex={hasEvents ? 0 : -1}
        onKeyDown={handleKeyDown}
        aria-label="Centered timeline. Upper band: Evia events. Lower band: rest of Greece events. Use wheel, drag, plus/minus, arrows, and R reset."
      >
        {!hasEvents ? <p className="timeline-empty-label">No visible events for the current state.</p> : null}
        {selectedOverlay && (
          <div style={{ position: 'absolute', top: margin.top, left: margin.left, zIndex: 10, maxWidth: 320, pointerEvents: 'auto' }} className="timeline-overlay-card-wrap">
            {selectedOverlay}
          </div>
        )}
        <svg
          ref={svgRef}
          width={Math.max(width, minimumInnerWidth + margin.left + margin.right)}
          height={svgHeight}
          role="img"
          aria-label="Evia timeline with geographic split and yearly fire season markers"
          onClick={() => onSelectEvent(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={innerWidth} height={timelineHeight} />
            </clipPath>
          </defs>

          <g transform={`translate(${margin.left},${margin.top})`}>
            <rect className="timeline-bg" x={0} y={0} width={innerWidth} height={timelineHeight} />

            {tickSpec.minorTicks.map((tick) => {
              const x = visibleScale(tick);
              const isJan1 = tick.getUTCMonth() === 0 && tick.getUTCDate() === 1;
              const is15th = tick.getUTCDate() === 15;
              // When solidYearMultiple is set, non-solid years become dotted
              const yearIsSolid = solidYearMultiple
                ? SOLID_YEARS.has(tick.getUTCFullYear())
                : true;
              const className = isJan1
                ? (yearIsSolid ? 'timeline-tick-year' : 'timeline-tick-daily')
                : 'timeline-tick-minor';
              return (
                <line
                  key={`minor-${tick.toISOString()}`}
                  x1={x}
                  x2={x}
                  y1={is15th ? 8 : 0}
                  y2={timelineHeight}
                  className={className}
                />
              );
            })}

            {/* Fixed year label in upper-left when zoomed in and no Jan tick visible */}
            {visibleSpanDays < 365 && !tickSpec.majorTicks.some((t) => t.getUTCMonth() === 0) && (
              <text
                x={4}
                y={-8}
                className="timeline-tick-label timeline-tick-label-year"
              >
                {visibleDomain[0].getUTCFullYear()}
              </text>
            )}

            {tickSpec.dailyTicks.map((tick) => {
              const x = visibleScale(tick);
              return (
                <line
                  key={`daily-${tick.toISOString()}`}
                  x1={x}
                  x2={x}
                  y1={8}
                  y2={timelineHeight}
                  className="timeline-tick-daily"
                />
              );
            })}

            {tickSpec.majorTicks.map((tick) => {
              const x = visibleScale(tick);
              const isJanuary = tick.getUTCMonth() === 0;
              // When solidYearMultiple is set, non-solid Jan lines become dotted
              const yearIsSolid = solidYearMultiple
                ? SOLID_YEARS.has(tick.getUTCFullYear())
                : true;
              const lineClass = isJanuary
                ? (yearIsSolid ? 'timeline-tick-major' : 'timeline-tick-daily')
                : 'timeline-tick-secondary';
              return (
                <g key={`major-${tick.toISOString()}`}>
                  <line
                    x1={x} x2={x} y1={0} y2={timelineHeight}
                    className={lineClass}
                  />
                  <text
                    x={x + 2}
                    y={isJanuary ? -8 : -2}
                    className={isJanuary ? 'timeline-tick-label timeline-tick-label-year' : 'timeline-tick-label timeline-tick-label-month'}
                  >
                    {tickSpec.formatMajor(tick)}
                  </text>
                </g>
              );
            })}

            {/* Band labels rotated 90° (outside clip so they don't get cut) */}
            {!hideLabels && layout.bands.map((band) => {
              // EVIA label near the bottom of the band (close to the divider)
              const labelY = band.id === 'evia'
                ? band.topY + band.bandHeight + verticalOffset - 4
                : band.topY + verticalOffset + 4;
              return (
                <text
                  key={band.id}
                  className="timeline-zone-label"
                  transform={`translate(14, ${labelY}) rotate(-90)`}
                  textAnchor={band.id === 'evia' ? 'start' : 'end'}
                >
                  {band.label}
                </text>
              );
            })}

            <g clipPath={`url(#${clipId})`}>
              {!hideFireSeasons && fireSeasons.map((season) => {
                const xStart = visibleScale(new Date(season.startTs));
                const xEnd = visibleScale(new Date(season.endTs));
                const widthPx = Math.max(1, xEnd - xStart);

                return (
                  <rect
                    key={season.id}
                    x={xStart}
                    y={0}
                    width={widthPx}
                    height={timelineHeight}
                    className="timeline-fire-season"
                  />
                );
              })}

              {/* Duration events first, then point events on top for z-order */}
              {[...layout.events].sort((a, b) => {
                const aIsPoint = !a.endTs || a.endTs === a.startTs;
                const bIsPoint = !b.endTs || b.endTs === b.startTs;
                if (aIsPoint === bIsPoint) return 0;
                return aIsPoint ? 1 : -1;
              }).filter((event) => {
                if (hideFireEvents) {
                  const cat = event.category;
                  if (cat === 'wildfire' || cat === 'suppression' || cat === 'flood') return false;
                }
                return true;
              }).filter((event) => {
                if (hideDurationEvents && event.endTs && event.endTs !== event.startTs) return false;
                return true;
              }).map((event) => {
                const xStart = visibleScale(new Date(event.startTs));
                const xEnd = visibleScale(new Date(event.endTs ?? event.startTs));
                const hasDuration = !!(event.endTs && event.endTs !== event.startTs);
                const laneH = event.laneH;
                const yTop = event.y + verticalOffset;
                const yMid = yTop + laneH / 2;
                const isSelected = event.id === selectedEventId;
                const widthPx = Math.max(eventMinWidth, xEnd - xStart);

                const iconFile = resolveEventIcon(event, hasDuration);
                const iconHref = `${ICON_BASE}${iconFile}`;

                // Fire/suppression/flood point events use the full lane height
                const isEnvironmental = event.category === 'wildfire' || event.category === 'suppression' || event.category === 'flood';
                const pointH = isEnvironmental ? laneH : pointIconSize;
                const pointW = isEnvironmental ? laneH * (24 / 14) : 16;

                // Legislation events: center on the Evia/Attica divider line
                const isLegislation = event.category === 'legislation' || event.category === 'forestry-policy';
                const dividerY = layout.dividers.length > 0 ? layout.dividers[0] + verticalOffset : yTop;

                // Point events: icon centred on the start position
                // Duration events: keep native aspect ratio (24:14), tile via pattern
                const isHighlighted = highlightedIds?.has(event.id) ?? false;
                const selectedScale = (!hasDuration && (isSelected || isHighlighted)) ? 1.5 : 1;
                const legScale = isLegislation ? 1.5 : 1;
                const finalScale = Math.max(selectedScale, legScale);
                const finalW = pointW * finalScale;
                const finalH = pointH * finalScale;
                const iconW = hasDuration ? widthPx : finalW;
                const iconH = hasDuration ? laneH : finalH;
                const iconX = hasDuration ? xStart : xStart - finalW / 2;

                // allPointsOnDivider: all point events center on the Evia/Attica divider
                const isPoint = !hasDuration;
                const isEviaPoint = event.band === 'evia' && isPoint && !isEnvironmental && !isLegislation;
                const eviaFireTop = layout.eviaFireLaneTopY + verticalOffset;
                const isAtticaPoint = event.band === 'attica' && isPoint && !isEnvironmental && !isLegislation;
                const atticaFireBottom = layout.atticaFireLaneBottomY + verticalOffset;

                let iconY: number;
                if (allPointsOnDivider && isPoint && !isLegislation) {
                  // All point events on the Evia/Attica divider line
                  iconY = dividerY - finalH / 2;
                } else if (isLegislation) {
                  iconY = dividerY - finalH / 2;
                } else if (isEviaPoint) {
                  iconY = eviaFireTop - finalH / 2;
                } else if (isAtticaPoint) {
                  iconY = atticaFireBottom - finalH / 2;
                } else if (hasDuration) {
                  iconY = yTop;
                } else {
                  iconY = yMid - finalH / 2;
                }

                // MIDEIA flood: stretch from North Evia fire top to its normal y, render behind
                const isMideia = event.id === 'evia-2021-mideia';
                let finalIconH = hasDuration ? laneH : finalH;
                let finalIconY = iconY;
                if (isMideia && hasDuration) {
                  finalIconY = eviaFireTop;
                  finalIconH = (yTop + laneH) - eviaFireTop;
                }

                // For duration: one tile keeps the SVG's native 24×14 ratio
                const tileW = laneH * (24 / 14);
                const patternId = `pat-${event.id.replace(/[^a-zA-Z0-9-]/g, '')}`;

                const bandLabel = event.band === 'evia' ? 'Evia' : event.band === 'attica' ? 'Attica' : 'rest of Greece';
                const eventLabel = `${event.title}. ${event.displayDate}. ${bandLabel}. Category ${getCategoryLabel(event.category)}.`;

                return (
                  <g
                    key={event.id}
                    className={`timeline-event ${isSelected ? 'is-selected' : ''} ${isMideia ? 'mideia-bg' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={eventLabel}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onSelectEvent(event.id);
                    }}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                        keyEvent.preventDefault();
                        onSelectEvent(event.id);
                      }
                    }}
                    style={{ opacity: 1 }}
                  >
                    {hasDuration ? (
                      <>
                        <defs>
                          <pattern
                            id={patternId}
                            width={tileW}
                            height={iconH}
                            patternUnits="userSpaceOnUse"
                            x={iconX}
                            y={iconY}
                          >
                            <image
                              href={iconHref}
                              width={tileW}
                              height={iconH}
                              preserveAspectRatio="none"
                            />
                          </pattern>
                        </defs>
                        <rect
                          x={iconX}
                          y={iconY}
                          width={iconW}
                          height={iconH}
                          fill={`url(#${patternId})`}
                        />
                      </>
                    ) : (
                      <image
                        href={iconHref}
                        x={iconX}
                        y={iconY}
                        width={iconW}
                        height={iconH}
                        preserveAspectRatio="xMidYMid meet"
                      />
                    )}
                    {labelVisibility.get(event.id) && (
                      <text
                        x={hasDuration ? xStart + 4 : xStart + 12}
                        y={isEnvironmental ? yTop + 12 : yMid - 5}
                        className="timeline-zone-label timeline-fire-label"
                      >
                        {truncateLabel(event.title, visibleSpanDays > 365.25 * 6 ? 28 : 42)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Divider lines — rendered after clip group so they draw on top of events */}
            {layout.dividers.map((dy, i) => (
              <line
                key={`div-${i}`}
                x1={0}
                x2={innerWidth}
                y1={dy + verticalOffset}
                y2={dy + verticalOffset}
                className={`timeline-divider-line ${i === 0 ? 'divider-primary' : 'divider-secondary'}`}
              />
            ))}

            {/* Event symbols rendered after dividers so their pixels appear on top of the line */}
            {layout.events
              .filter((e) => {
                const isLeg = e.category === 'legislation' || e.category === 'forestry-policy';
                if (pointsAboveDivider) {
                  const isPoint = !e.endTs || e.endTs === e.startTs;
                  return isLeg || (isPoint && allPointsOnDivider);
                }
                return isLeg;
              })
              .filter((e) => {
                if (hideFireEvents) {
                  const cat = e.category;
                  if (cat === 'wildfire' || cat === 'suppression' || cat === 'flood') return false;
                }
                return true;
              })
              .map((event) => {
                const xStart = visibleScale(new Date(event.startTs));
                const hasDuration = !!(event.endTs && event.endTs !== event.startTs);
                const iconFile = resolveEventIcon(event, hasDuration);
                const iconHref = `${ICON_BASE}${iconFile}`;
                const dividerY = layout.dividers[0] + verticalOffset;
                const isLeg = event.category === 'legislation' || event.category === 'forestry-policy';
                const scale = isLeg ? 1.5 : 1;
                const h = pointIconSize * scale;
                const w = 16 * scale;
                return (
                  <image
                    key={`leg-${event.id}`}
                    href={iconHref}
                    x={xStart - w / 2}
                    y={dividerY - h / 2}
                    width={w}
                    height={h}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })}
          </g>
        </svg>
      </div>
    </section>
  );
}
