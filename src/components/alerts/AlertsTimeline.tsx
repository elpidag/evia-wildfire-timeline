import { useCallback, useMemo, useRef } from 'react';
import { pointer, scaleTime } from 'd3';
import { useElementSize } from '@/lib/utils/useElementSize';
import {
  TIMELINE_START,
  TIMELINE_END,
  PLAYBACK_SPEEDS,
  type PlaybackSpeed
} from '@/lib/alerts/constants';
import type { ProcessedAlert } from '@/lib/alerts/schema';

type AlertsTimelineProps = {
  alerts: ProcessedAlert[];
  currentTime: Date;
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  onTimeChange: (time: Date) => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
};

const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 16;
const SVG_HEIGHT = 48;
const CONTROLS_HEIGHT = 36;
const TICK_HEIGHT = 16;

const LABEL_DAYS = [1, 5, 10, 15, 20];

const athensFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Athens'
});

function formatCurrentTime(date: Date): string {
  return athensFormatter.format(date);
}

function buildDayTicks(start: Date, end: Date): Date[] {
  const ticks: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    ticks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return ticks;
}

export default function AlertsTimeline({
  alerts,
  currentTime,
  isPlaying,
  playbackSpeed,
  onTimeChange,
  onPlayPause,
  onSpeedChange
}: AlertsTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const { width } = useElementSize(containerRef, { width: 0, height: 0 });

  const xScale = useMemo(() => {
    const rangeEnd = Math.max(MARGIN_LEFT + 1, width - MARGIN_RIGHT);
    return scaleTime().domain([TIMELINE_START, TIMELINE_END]).range([MARGIN_LEFT, rangeEnd]).clamp(true);
  }, [width]);

  const dayTicks = useMemo(() => buildDayTicks(TIMELINE_START, TIMELINE_END), []);

  const clampToTimeline = useCallback(
    (x: number): Date => xScale.invert(x) as Date,
    [xScale]
  );

  const handleScrub = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const [x] = pointer(event.nativeEvent, event.currentTarget);
      onTimeChange(clampToTimeline(x));
    },
    [clampToTimeline, onTimeChange]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      isDraggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      handleScrub(event);
    },
    [handleScrub]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!isDraggingRef.current) return;
      handleScrub(event);
    },
    [handleScrub]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      isDraggingRef.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    []
  );

  const playheadX = xScale(currentTime);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        background: 'var(--color-surface, #ffffff)',
        borderTop: '1px solid var(--color-rule)',
        userSelect: 'none',
      }}
    >
      {/* SVG timeline */}
      <svg
        width={width}
        height={SVG_HEIGHT}
        style={{ display: 'block', cursor: 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Alert timeline scrubber"
      >
        {/* Background track */}
        <rect
          x={MARGIN_LEFT}
          y={SVG_HEIGHT - 10}
          width={Math.max(0, width - MARGIN_LEFT - MARGIN_RIGHT)}
          height={1}
          fill="var(--color-rule)"
        />

        {/* Day tick marks */}
        {dayTicks.map((tick) => {
          const x = xScale(tick);
          const day = tick.getDate();
          const isLabeled = LABEL_DAYS.includes(day);
          const isFirst = day === LABEL_DAYS[0];

          return (
            <g key={tick.toISOString()}>
              <line
                x1={x} x2={x}
                y1={SVG_HEIGHT - 8}
                y2={SVG_HEIGHT}
                stroke="var(--color-rule)"
                strokeWidth={1}
              />
              {isLabeled && (
                <text
                  x={x}
                  y={SVG_HEIGHT - 14}
                  textAnchor="middle"
                  fill="var(--color-muted)"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '8px',
                    letterSpacing: '0.04em',
                  }}
                >
                  {isFirst ? `${day} Aug` : String(day)}
                </text>
              )}
            </g>
          );
        })}

        {/* Alert tick marks */}
        {alerts.map((alert) => {
          const t = new Date(alert.timestamp);
          const x = xScale(t);
          return (
            <line
              key={alert.tweetId}
              x1={x} x2={x}
              y1={SVG_HEIGHT - 10 - TICK_HEIGHT}
              y2={SVG_HEIGHT - 10}
              stroke="#c74949"
              strokeWidth={1.5}
              opacity={0.6}
            >
              <title>{t.toLocaleString('en-GB', { timeZone: 'Europe/Athens' })}</title>
            </line>
          );
        })}

        {/* Playhead */}
        {width > 0 && (
          <>
            <line
              x1={playheadX} x2={playheadX}
              y1={4}
              y2={SVG_HEIGHT}
              stroke="var(--color-text)"
              strokeWidth={1.5}
            />
            <circle
              cx={playheadX}
              cy={4}
              r={3}
              fill="var(--color-text)"
            />
          </>
        )}
      </svg>

      {/* Controls bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: CONTROLS_HEIGHT,
          padding: '0 12px',
          borderTop: '1px solid var(--color-rule)',
        }}
      >
        {/* Left: play/pause + speed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={onPlayPause}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: isPlaying ? 'rgba(199,73,73,0.2)' : 'var(--color-surface-soft)',
              border: 'none',
              color: isPlaying ? '#c74949' : 'var(--color-text)',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: 2,
            }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <div style={{ width: 1, height: 14, background: 'var(--color-rule)', margin: '0 2px' }} />

          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => onSpeedChange(speed)}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.6rem',
                fontWeight: speed === playbackSpeed ? 600 : 400,
                letterSpacing: '0.04em',
                background: speed === playbackSpeed ? 'var(--color-rule)' : 'transparent',
                border: 'none',
                color: speed === playbackSpeed ? 'var(--color-text)' : 'var(--color-muted)',
                cursor: 'pointer',
                padding: '3px 6px',
                borderRadius: 2,
              }}
            >
              {speed}x
            </button>
          ))}
        </div>

        {/* Right: current time */}
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.68rem',
            fontWeight: 500,
            letterSpacing: '0.03em',
            color: 'var(--color-muted)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatCurrentTime(currentTime)}
        </div>
      </div>
    </div>
  );
}
