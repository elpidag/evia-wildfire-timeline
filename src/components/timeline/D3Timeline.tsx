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
  getCategorySvgIcon,
} from '@/lib/timeline/categories';
import { buildTickSpec, createBaseTimeScale } from '@/lib/timeline/ticks';
import type { TimelineEvent } from '@/lib/timeline/types';
import { useElementSize } from '@/lib/utils';

type D3TimelineProps = {
  events: TimelineEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
};

type BandId = 'evia' | 'attica' | 'rest';

type PositionedEvent = TimelineEvent & {
  band: BandId;
  laneIndex: number;
  y: number;
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

const dividerGap = 20;

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

  const bandHeights = laneCounts.map(
    (lc, i) => lc * packed[i].def.laneHeight + Math.max(0, lc - 1) * laneGap
  );

  // Compute top-Y for each band.
  // Between Evia and Attica: no gap — the fire bars sit right on the divider line.
  // Between Attica and Rest: normal dividerGap.
  const topYs: number[] = [];
  let cursor = 0;
  for (let i = 0; i < bandDefs.length; i++) {
    topYs.push(cursor);
    const gapAfter = i === 0 ? 0 : dividerGap;
    cursor += bandHeights[i] + gapAfter;
  }

  const totalHeight = cursor;

  // Divider Y positions: Evia/Attica line sits at the bottom edge of the Evia band.
  // Attica/Rest line sits centered in the gap between those bands.
  const dividers: number[] = [];
  dividers.push(topYs[0] + bandHeights[0]); // Evia/Attica: right at the bottom of Evia
  if (bandDefs.length > 2) {
    dividers.push(topYs[1] + bandHeights[1] + dividerGap / 2); // Attica/Rest: centered in gap
  }

  const bands: BandInfo[] = bandDefs.map((def, i) => ({
    id: def.id,
    label: def.label,
    laneCount: laneCounts[i],
    bandHeight: bandHeights[i],
    topY: topYs[i],
  }));

  const positionedEvents: PositionedEvent[] = packed.flatMap((b, bi) => {
    const lh = b.def.laneHeight;
    const maxLane = laneCounts[bi] - 1;
    return b.events.map((event) => ({
      ...event,
      // Evia band: reverse lanes so lane 0 (fire/suppression) sits at the bottom, near the divider
      y: b.def.id === 'evia'
        ? topYs[bi] + (maxLane - event.laneIndex) * (lh + laneGap)
        : topYs[bi] + event.laneIndex * (lh + laneGap),
    }));
  });

  return {
    events: positionedEvents,
    bands,
    dividers,
    height: totalHeight,
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
  selectedEventId: string | null,
  spanDays: number,
  xForEvent: (event: PositionedEvent) => number
): Map<string, boolean> {
  const labels = new Map<string, boolean>();

  if (spanDays > 365.25 * 40) {
    for (const event of events) {
      labels.set(event.id, event.id === selectedEventId);
    }
    return labels;
  }

  const minGapPx = spanDays > 365.25 * 12 ? 120 : spanDays > 365.25 * 5 ? 70 : spanDays > 365.25 * 2 ? 42 : 18;
  const laneLastX = new Map<string, number>();

  const sorted = [...events].sort((a, b) => xForEvent(a) - xForEvent(b));

  for (const event of sorted) {
    const laneKey = `${event.band}:${event.laneIndex}`;
    const x = xForEvent(event);
    const lastX = laneLastX.get(laneKey);

    const forceVisible = event.id === selectedEventId || (event.featured && spanDays <= 365.25 * 20);
    const visible = forceVisible || lastX === undefined || x - lastX >= minGapPx;

    labels.set(event.id, visible);
    if (visible) {
      laneLastX.set(laneKey, x);
    }
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

export default function D3Timeline({ events, selectedEventId, onSelectEvent }: D3TimelineProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const clipId = useId().replace(/:/g, '-');
  const { width, height: hostHeight } = useElementSize(hostRef, { width: 0, height: 0 });

  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  const hasEvents = events.length > 0;
  const layout = useMemo(() => computeBandLayout(events), [events]);

  const minimumTimelineHeight = Math.max(220, Math.round(hostHeight));
  const timelineHeight = Math.max(layout.height, minimumTimelineHeight);
  const verticalOffset = Math.max(0, Math.round((timelineHeight - layout.height) / 2));
  const svgHeight = margin.top + timelineHeight + margin.bottom;
  const innerWidth = Math.max(minimumInnerWidth, width - margin.left - margin.right);

  const baseDomain = FIXED_DOMAIN;

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
    if (!svgRef.current || innerWidth <= 0) {
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
      .scaleExtent([1, 720])
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
  }, [innerWidth, timelineHeight]);

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
    if (!svgRef.current || !zoomBehaviorRef.current) {
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

  const xForEvent = (event: PositionedEvent): number => visibleScale(new Date(event.startTs));

  const labelVisibility = useMemo(() => {
    return buildLabelVisibility(layout.events, selectedEventId, visibleSpanDays, xForEvent);
  }, [layout.events, selectedEventId, visibleSpanDays, visibleScale]);

  return (
    <section className="timeline-card" aria-label="Timeline engine">
      <div
        className="timeline-host"
        ref={hostRef}
        tabIndex={hasEvents ? 0 : -1}
        onKeyDown={handleKeyDown}
        aria-label="Centered timeline. Upper band: Evia events. Lower band: rest of Greece events. Use wheel, drag, plus/minus, arrows, and R reset."
      >
        {!hasEvents ? <p className="timeline-empty-label">No visible events for the current state.</p> : null}
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
              return (
                <line
                  key={`minor-${tick.toISOString()}`}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={timelineHeight}
                  className="timeline-tick-minor"
                />
              );
            })}

            {tickSpec.majorTicks.map((tick) => {
              const x = visibleScale(tick);
              return (
                <g key={`major-${tick.toISOString()}`}>
                  <line x1={x} x2={x} y1={0} y2={timelineHeight} className="timeline-tick-major" />
                  <text x={x + 2} y={-8} className="timeline-tick-label">
                    {tickSpec.formatMajor(tick)}
                  </text>
                </g>
              );
            })}

            {/* Band labels rotated 90° (outside clip so they don't get cut) */}
            {layout.bands.map((band) => {
              const topY = band.topY + verticalOffset + 4;
              return (
                <text
                  key={band.id}
                  className="timeline-zone-label"
                  transform={`translate(14, ${topY}) rotate(-90)`}
                  textAnchor="end"
                >
                  {band.label}
                </text>
              );
            })}

            <g clipPath={`url(#${clipId})`}>
              {fireSeasons.map((season) => {
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

              {layout.events.map((event) => {
                const xStart = visibleScale(new Date(event.startTs));
                const xEnd = visibleScale(new Date(event.endTs ?? event.startTs));
                const hasDuration = !!(event.endTs && event.endTs !== event.startTs);
                const bandLaneH = event.band === 'evia' ? eviaLaneHeight : defaultLaneHeight;
                const yTop = event.y + verticalOffset;
                const yMid = yTop + bandLaneH / 2;
                const isSelected = event.id === selectedEventId;
                const widthPx = Math.max(eventMinWidth, xEnd - xStart);

                const iconFile = getCategorySvgIcon(event.category, hasDuration);
                const iconHref = `${ICON_BASE}${iconFile}`;

                // Point events: 16×16 icon centred on the start position
                // Duration events: keep native aspect ratio (24:14), tile via pattern
                const iconW = hasDuration ? widthPx : 16;
                const iconH = hasDuration ? bandLaneH : pointIconSize;
                const iconX = hasDuration ? xStart : xStart - pointIconSize / 2;
                const iconY = hasDuration ? yTop : yMid - pointIconSize / 2;
                // For duration: one tile keeps the SVG's native 24×14 ratio
                const tileW = bandLaneH * (24 / 14);
                const patternId = `pat-${event.id.replace(/[^a-zA-Z0-9-]/g, '')}`;

                const bandLabel = event.band === 'evia' ? 'Evia' : event.band === 'attica' ? 'Attica' : 'rest of Greece';
                const eventLabel = `${event.title}. ${event.displayDate}. ${bandLabel}. Category ${getCategoryLabel(event.category)}.`;

                return (
                  <g
                    key={event.id}
                    className={`timeline-event ${isSelected ? 'is-selected' : ''}`}
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
                    style={{ opacity: isSelected ? 1 : 0.85 }}
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
                    {isSelected && (
                      <rect
                        x={iconX - 1}
                        y={iconY - 1}
                        width={iconW + 2}
                        height={iconH + 2}
                        fill="none"
                        stroke="var(--color-text)"
                        strokeWidth={1.2}
                      />
                    )}

                    {labelVisibility.get(event.id) && (
                      <text
                        x={hasDuration ? xStart + Math.min(10, widthPx + 6) : xStart + 12}
                        y={yMid - 5}
                        className={`timeline-event-label ${isSelected ? 'is-selected' : ''}`}
                      >
                        {truncateLabel(event.title, visibleSpanDays > 365.25 * 6 ? 28 : 42)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Divider lines — rendered last so they draw on top of events */}
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
          </g>
        </svg>
      </div>
    </section>
  );
}
