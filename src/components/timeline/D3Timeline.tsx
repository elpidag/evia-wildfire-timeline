import {
  extent,
  select,
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type Selection,
  type ZoomBehavior,
  type ZoomTransform
} from 'd3';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  getCategoryColor,
  getCategoryLabel,
  getCategorySymbol,
  type CategorySymbol
} from '@/lib/timeline/categories';
import { buildTickSpec, createBaseTimeScale } from '@/lib/timeline/ticks';
import type { TimelineEvent } from '@/lib/timeline/types';
import { useElementSize } from '@/lib/utils';

type D3TimelineProps = {
  events: TimelineEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
};

type PositionedEvent = TimelineEvent & {
  band: 'evia' | 'greece';
  laneIndex: number;
  y: number;
};

type BandLayout = {
  events: PositionedEvent[];
  topLaneCount: number;
  bottomLaneCount: number;
  height: number;
  centerY: number;
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
const eventHeight = 14;
const laneGap = 8;
const centerGap = 24;
const pointCollisionMs = 86_400_000;
const eventMinWidth = 6;

function getDomain(events: TimelineEvent[]): [Date, Date] {
  const startExtent = extent(events, (event) => event.startTs);
  const endExtent = extent(events, (event) => event.endTs ?? event.startTs);

  const minTs = Math.min(startExtent[0] ?? Date.UTC(1970, 0, 1), Date.UTC(1970, 0, 1));
  const maxTs = Math.max(endExtent[1] ?? Date.now(), Date.now());

  const span = Math.max(86_400_000, maxTs - minTs);
  const pad = Math.max(86_400_000 * 20, span * 0.04);

  return [new Date(minTs - pad), new Date(maxTs + pad)];
}

function getEventEndTs(event: TimelineEvent): number {
  if (event.endTs) {
    return event.endTs;
  }

  return event.startTs + pointCollisionMs;
}

function isEviaEvent(event: TimelineEvent): boolean {
  return event.places.some((placeId) => /evia/i.test(placeId));
}

function packBand(
  events: TimelineEvent[],
  band: PositionedEvent['band']
): Array<TimelineEvent & { laneIndex: number; band: PositionedEvent['band'] }> {
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
    let laneIndex = laneEndTs.findIndex((laneEnd) => laneEnd + pointCollisionMs < event.startTs);

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

function computeBandLayout(events: TimelineEvent[]): BandLayout {
  const eviaEvents = events.filter(isEviaEvent);
  const greeceEvents = events.filter((event) => !isEviaEvent(event));

  const packedTop = packBand(eviaEvents, 'evia');
  const packedBottom = packBand(greeceEvents, 'greece');

  const topLaneCount = Math.max(1, packedTop.reduce((max, event) => Math.max(max, event.laneIndex + 1), 0));
  const bottomLaneCount = Math.max(1, packedBottom.reduce((max, event) => Math.max(max, event.laneIndex + 1), 0));

  const topHeight = topLaneCount * eventHeight + Math.max(0, topLaneCount - 1) * laneGap;
  const bottomHeight = bottomLaneCount * eventHeight + Math.max(0, bottomLaneCount - 1) * laneGap;

  const centerY = topHeight + centerGap;
  const height = topHeight + bottomHeight + centerGap * 2;

  const positionedEvents: PositionedEvent[] = [
    ...packedTop.map((event) => ({
      ...event,
      y: centerY - centerGap - eventHeight - event.laneIndex * (eventHeight + laneGap)
    })),
    ...packedBottom.map((event) => ({
      ...event,
      y: centerY + centerGap + event.laneIndex * (eventHeight + laneGap)
    }))
  ];

  return {
    events: positionedEvents,
    topLaneCount,
    bottomLaneCount,
    height,
    centerY
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

function renderPointMarker(
  symbol: CategorySymbol,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string,
  strokeWidth: number
): ReactNode {
  if (symbol === 'square') {
    return (
      <rect
        x={x - size}
        y={y - size}
        width={size * 2}
        height={size * 2}
        style={{ fill, stroke, strokeWidth }}
      />
    );
  }

  if (symbol === 'diamond') {
    return (
      <polygon
        points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
        style={{ fill, stroke, strokeWidth }}
      />
    );
  }

  if (symbol === 'triangle') {
    return (
      <polygon
        points={`${x},${y - size} ${x + size},${y + size} ${x - size},${y + size}`}
        style={{ fill, stroke, strokeWidth }}
      />
    );
  }

  return <circle cx={x} cy={y} r={size} style={{ fill, stroke, strokeWidth }} />;
}

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
  const dividerY = layout.centerY + verticalOffset;
  const svgHeight = margin.top + timelineHeight + margin.bottom;
  const innerWidth = Math.max(minimumInnerWidth, width - margin.left - margin.right);

  const baseDomain = useMemo(() => getDomain(events), [events]);

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
        setTransform(event.transform);
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

              <line x1={0} x2={innerWidth} y1={dividerY} y2={dividerY} className="timeline-divider-line" />
              <text x={8} y={dividerY - centerGap - 8} className="timeline-zone-label">
                Evia island events
              </text>
              <text x={8} y={dividerY + centerGap + 14} className="timeline-zone-label">
                Rest of Greece events
              </text>

              {layout.events.map((event) => {
                const color = getCategoryColor(event.category);
                const xStart = visibleScale(new Date(event.startTs));
                const xEnd = visibleScale(new Date(event.endTs ?? event.startTs));
                const yMid = event.y + verticalOffset + eventHeight / 2;
                const isSelected = event.id === selectedEventId;
                const widthPx = Math.max(eventMinWidth, xEnd - xStart);

                const markerSize = isSelected ? 5.6 : 4.4;
                const markerStroke = isSelected ? 'var(--color-text)' : '#ffffff';
                const markerStrokeWidth = isSelected ? 1.2 : 0.8;

                const locationLabel = event.band === 'evia' ? 'Evia island' : 'rest of Greece';
                const eventLabel = `${event.title}. ${event.displayDate}. ${locationLabel}. Category ${getCategoryLabel(event.category)}.`;

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
                  >
                    {event.isDuration ? (
                      <rect
                        x={xStart}
                        y={event.y + verticalOffset}
                        width={widthPx}
                        height={eventHeight}
                        rx={2}
                        style={{
                          fill: color,
                          opacity: isSelected ? 0.88 : 0.5,
                          stroke: isSelected ? 'var(--color-text)' : color,
                          strokeWidth: isSelected ? 1.2 : 0.8
                        }}
                      />
                    ) : (
                      renderPointMarker(
                        getCategorySymbol(event.category),
                        xStart,
                        yMid,
                        markerSize,
                        color,
                        markerStroke,
                        markerStrokeWidth
                      )
                    )}

                    {labelVisibility.get(event.id) && (
                      <text
                        x={event.isDuration ? xStart + Math.min(10, widthPx + 6) : xStart + 9}
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
          </g>
        </svg>
      </div>
    </section>
  );
}
