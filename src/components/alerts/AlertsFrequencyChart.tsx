import { useMemo, useRef } from 'react';
import { scaleTime, scaleLinear } from 'd3';
import { useElementSize } from '@/lib/utils/useElementSize';
import { TIMELINE_START, TIMELINE_END } from '@/lib/alerts/constants';
import type { ProcessedAlert } from '@/lib/alerts/schema';

type AlertsFrequencyChartProps = {
  alerts: ProcessedAlert[];
};

const CHART_HEIGHT = 140;
const MARGIN = { top: 8, right: 16, bottom: 24, left: 28 };

function generate6HourBins(start: Date, end: Date): Date[] {
  const bins: Date[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    bins.push(new Date(cursor));
    cursor.setTime(cursor.getTime() + 6 * 3600 * 1000);
  }
  return bins;
}

function buildBins(alerts: ProcessedAlert[], bins: Date[]): { binStart: Date; count: number }[] {
  const binInterval = 6 * 3600 * 1000;
  const startMs = bins[0]?.getTime() ?? 0;
  const counts = new Map<number, number>();
  for (const bin of bins) counts.set(bin.getTime(), 0);

  for (const alert of alerts) {
    const ts = new Date(alert.timestamp).getTime();
    const binIndex = Math.floor((ts - startMs) / binInterval);
    if (binIndex < 0 || binIndex >= bins.length) continue;
    const key = bins[binIndex].getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return bins.map((binStart) => ({ binStart, count: counts.get(binStart.getTime()) ?? 0 }));
}

export default function AlertsFrequencyChart({ alerts }: AlertsFrequencyChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width } = useElementSize(containerRef, { width: 0, height: 0 });

  const bins = useMemo(() => generate6HourBins(TIMELINE_START, TIMELINE_END), []);
  const binData = useMemo(() => buildBins(alerts, bins), [alerts, bins]);
  const maxCount = useMemo(() => binData.reduce((max, b) => Math.max(max, b.count), 0), [binData]);

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const xScale = useMemo(
    () => scaleTime().domain([TIMELINE_START, TIMELINE_END]).range([0, innerWidth]),
    [innerWidth]
  );

  const yScale = useMemo(
    () => scaleLinear().domain([0, Math.max(1, maxCount)]).range([innerHeight, 0]).nice(),
    [innerHeight, maxCount]
  );

  const xTicks = useMemo(() => {
    const ticks: Date[] = [];
    const cursor = new Date(TIMELINE_START);
    while (cursor <= TIMELINE_END) {
      ticks.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 3);
    }
    return ticks;
  }, []);

  const yTicks = useMemo(() => {
    const top = yScale.domain()[1];
    const step = top <= 5 ? 1 : top <= 20 ? 5 : 10;
    const ticks: number[] = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);
    return ticks;
  }, [yScale]);

  const barWidth = Math.max(1, (innerWidth / bins.length) - 1);

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-rule)',
        paddingTop: 16,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--color-muted)',
          marginBottom: 10,
        }}
      >
        Alert frequency
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.58rem',
            letterSpacing: '0.06em',
            color: 'var(--color-swatch-gray-4)',
            marginLeft: 8,
            fontWeight: 400,
            textTransform: 'none',
          }}
        >
          6-hour blocks
        </span>
      </div>

      <div ref={containerRef} style={{ width: '100%' }}>
        {width > 0 && (
          <svg width={width} height={CHART_HEIGHT} style={{ display: 'block' }}>
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {/* Grid lines */}
              {yTicks.map((v) => (
                <line
                  key={`g-${v}`}
                  x1={0} x2={innerWidth}
                  y1={yScale(v)} y2={yScale(v)}
                  stroke="var(--color-rule)"
                  strokeWidth={0.5}
                  strokeDasharray={v === 0 ? undefined : '2,4'}
                />
              ))}

              {/* Bars */}
              {binData.map((bin) => {
                if (bin.count === 0) return null;
                const x = xScale(bin.binStart);
                const barH = innerHeight - yScale(bin.count);
                const y = yScale(bin.count);
                return (
                  <rect
                    key={bin.binStart.getTime()}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(0, barH)}
                    fill="#c74949"
                    opacity={0.65}
                    rx={1}
                  >
                    <title>{`${bin.count} alert${bin.count !== 1 ? 's' : ''}`}</title>
                  </rect>
                );
              })}

              {/* X-axis */}
              <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke="var(--color-rule)" strokeWidth={1} />
              {xTicks.map((tick) => {
                const x = xScale(tick);
                return (
                  <text
                    key={tick.toISOString()}
                    x={x} y={innerHeight + 14}
                    textAnchor="middle"
                    fill="var(--color-muted)"
                    style={{ fontFamily: 'var(--font-sans)', fontSize: '8px', letterSpacing: '0.04em' }}
                  >
                    {`${tick.getDate()} Aug`}
                  </text>
                );
              })}

              {/* Y-axis */}
              {yTicks.map((v) => (
                <text
                  key={`y-${v}`}
                  x={-6} y={yScale(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--color-muted)"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: '8px' }}
                >
                  {v}
                </text>
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
