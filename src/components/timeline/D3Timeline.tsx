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
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react';
import { getCategoryColor, getCategoryLabel } from '@/lib/timeline/categories';
import { computeLaneLayout } from '@/lib/timeline/layout';
import { buildTickSpec, createBaseTimeScale } from '@/lib/timeline/ticks';
import type { LaneEvent, TimelineEvent } from '@/lib/timeline/types';
import { useElementSize } from '@/lib/utils';

type D3TimelineProps = {
  events: TimelineEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
};

const margin = {
  top: 38,
  right: 16,
  bottom: 24,
  left: 174
};

const eventMinWidth = 5;

type OverlaySelection = Selection<SVGRectElement, unknown, null, undefined>;

function getDomain(events: TimelineEvent[]): [Date, Date] {
  const startExtent = extent(events, (event) => event.startTs);
  const endExtent = extent(events, (event) => event.endTs ?? event.startTs);

  const minTs = startExtent[0] ?? Date.UTC(1970, 0, 1);
  const maxTs = endExtent[1] ?? Date.now();

  const span = Math.max(86_400_000, maxTs - minTs);
  const pad = Math.max(86_400_000 * 20, span * 0.04);

  return [new Date(minTs - pad), new Date(maxTs + pad)];
}

function buildLabelVisibility(
  events: LaneEvent[],
  selectedEventId: string | null,
  spanDays: number,
  xForEvent: (event: LaneEvent) => number
): Map<string, boolean> {
  const labels = new Map<string, boolean>();

  if (spanDays > 365.25 * 40) {
    for (const event of events) {
      labels.set(event.id, event.id === selectedEventId);
    }
    return labels;
  }

  const minGapPx = spanDays > 365.25 * 12 ? 120 : spanDays > 365.25 * 5 ? 68 : spanDays > 365.25 * 2 ? 38 : 16;
  const laneLastX = new Map<string, number>();

  const sorted = [...events].sort((a, b) => xForEvent(a) - xForEvent(b));

  for (const event of sorted) {
    const laneKey = `${event.categoryIndex}:${event.laneIndex}`;
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

export default function D3Timeline({ events, selectedEventId, onSelectEvent }: D3TimelineProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGRectElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGRectElement, unknown> | null>(null);

  const clipId = useId().replace(/:/g, '-');
  const { width } = useElementSize(hostRef, { width: 0, height: 0 });

  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  const laneLayout = useMemo(() => {
    return computeLaneLayout(events);
  }, [events]);
  const hasEvents = events.length > 0;

  const timelineHeight = laneLayout.totalHeight;
  const svgHeight = margin.top + timelineHeight + margin.bottom;
  const innerWidth = Math.max(360, width - margin.left - margin.right);

  const baseDomain = useMemo(() => getDomain(events), [events]);

  const baseScale = useMemo(() => {
    return createBaseTimeScale(baseDomain, [0, innerWidth]);
  }, [baseDomain, innerWidth]);

  const visibleScale = useMemo(() => {
    return transform.rescaleX(baseScale);
  }, [baseScale, transform]);

  const visibleDomain = visibleScale.domain();
  const visibleSpanDays = Math.max(1, (visibleDomain[1].getTime() - visibleDomain[0].getTime()) / 86_400_000);

  const tickSpec = useMemo(() => {
    return buildTickSpec(visibleScale);
  }, [visibleScale]);

  useEffect(() => {
    if (!overlayRef.current || innerWidth <= 0) {
      return;
    }

    const behavior = zoom<SVGRectElement, unknown>()
      .scaleExtent([1, 720])
      .translateExtent([
        [0, 0],
        [innerWidth, timelineHeight]
      ])
      .extent([
        [0, 0],
        [innerWidth, timelineHeight]
      ])
      .on('zoom', (event: D3ZoomEvent<SVGRectElement, unknown>) => {
        setTransform(event.transform);
      });

    zoomBehaviorRef.current = behavior;

    const overlay = select<SVGRectElement, unknown>(overlayRef.current);
    overlay.call(behavior);

    return () => {
      overlay.on('.zoom', null);
    };
  }, [innerWidth, timelineHeight]);

  const runZoomCommand = (
    command: (selection: OverlaySelection, behavior: ZoomBehavior<SVGRectElement, unknown>) => void
  ): void => {
    const behavior = zoomBehaviorRef.current;
    const overlay = overlayRef.current;

    if (!behavior || !overlay) {
      return;
    }

    const selection = select<SVGRectElement, unknown>(overlay);
    command(selection, behavior);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!overlayRef.current || !zoomBehaviorRef.current) {
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

  const xForEvent = (event: LaneEvent): number => visibleScale(new Date(event.startTs));

  const labelVisibility = useMemo(() => {
    return buildLabelVisibility(laneLayout.events, selectedEventId, visibleSpanDays, xForEvent);
  }, [laneLayout.events, selectedEventId, visibleSpanDays, visibleScale]);

  return (
    <section className="timeline-card" aria-label="Timeline engine">
      <div className="timeline-toolbar">
        <div>
          <p className="timeline-toolbar-label">Range</p>
          <p className="timeline-toolbar-value">
            {tickSpec.formatMajor(visibleDomain[0])} - {tickSpec.formatMajor(visibleDomain[1])}
          </p>
        </div>
        <div className="timeline-toolbar-actions">
          <button
            type="button"
            className="timeline-button"
            disabled={!hasEvents}
            onClick={() => {
              runZoomCommand((selection, behavior) => {
                selection.call(behavior.scaleBy, 1.28, [innerWidth / 2, 0]);
              });
            }}
          >
            Zoom in
          </button>
          <button
            type="button"
            className="timeline-button"
            disabled={!hasEvents}
            onClick={() => {
              runZoomCommand((selection, behavior) => {
                selection.call(behavior.scaleBy, 0.78, [innerWidth / 2, 0]);
              });
            }}
          >
            Zoom out
          </button>
          <button
            type="button"
            className="timeline-button"
            disabled={!hasEvents}
            onClick={() => {
              runZoomCommand((selection, behavior) => {
                selection.call(behavior.transform, zoomIdentity);
              });
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div
        className="timeline-host"
        ref={hostRef}
        tabIndex={hasEvents ? 0 : -1}
        onKeyDown={handleKeyDown}
        aria-label="Zoomable timeline. Use wheel or drag to zoom and pan. Keyboard: plus/minus, arrows, and R reset."
      >
        {!hasEvents ? (
          <p className="timeline-empty-label">No visible events for the current filter state.</p>
        ) : null}
        <svg width={Math.max(width, 640)} height={svgHeight} role="img" aria-label="Evia timeline from 1970 to today">
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

            {laneLayout.categories.map((lane) => (
              <g key={lane.category}>
                <line x1={0} x2={innerWidth} y1={lane.y} y2={lane.y} className="timeline-lane-rule" />
                <text x={-12} y={lane.y + 14} className="timeline-lane-label" textAnchor="end">
                  {getCategoryLabel(lane.category)}
                </text>
              </g>
            ))}

            <line x1={0} x2={innerWidth} y1={timelineHeight} y2={timelineHeight} className="timeline-lane-rule" />

            <g clipPath={`url(#${clipId})`}>
              {laneLayout.events.map((event) => {
                const color = getCategoryColor(event.category);
                const xStart = visibleScale(new Date(event.startTs));
                const xEnd = visibleScale(new Date(event.endTs ?? event.startTs));
                const yMid = event.laneY + event.laneHeight / 2;
                const isSelected = event.id === selectedEventId;
                const isDuration = event.isDuration;
                const widthPx = Math.max(eventMinWidth, xEnd - xStart);

                const eventLabel = `${event.title}. ${event.displayDate}. Category ${getCategoryLabel(event.category)}.`;

                return (
                  <g
                    key={event.id}
                    className={`timeline-event ${isSelected ? 'is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={eventLabel}
                    onClick={() => onSelectEvent(event.id)}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                        keyEvent.preventDefault();
                        onSelectEvent(event.id);
                      }
                    }}
                  >
                    {isDuration ? (
                      <rect
                        x={xStart}
                        y={event.laneY}
                        width={widthPx}
                        height={event.laneHeight}
                        rx={2}
                        style={{
                          fill: color,
                          opacity: isSelected ? 0.9 : 0.45,
                          stroke: isSelected ? 'var(--color-text)' : color,
                          strokeWidth: isSelected ? 1.2 : 0.7
                        }}
                      />
                    ) : (
                      <circle
                        cx={xStart}
                        cy={yMid}
                        r={isSelected ? 5.3 : 4.1}
                        style={{
                          fill: color,
                          stroke: isSelected ? 'var(--color-text)' : 'transparent',
                          strokeWidth: isSelected ? 1.1 : 0
                        }}
                      />
                    )}

                    {labelVisibility.get(event.id) && (
                      <text
                        x={isDuration ? xStart + Math.min(8, widthPx + 6) : xStart + 8}
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

            <rect
              ref={overlayRef}
              x={0}
              y={0}
              width={innerWidth}
              height={timelineHeight}
              className="timeline-zoom-hitbox"
              aria-hidden="true"
            />
          </g>
        </svg>
      </div>
    </section>
  );
}
