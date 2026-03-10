import { axisTop, easeCubicOut, scaleBand, scaleLinear, select } from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatPercent,
  formatProjectCount,
  fundingProvenanceColors,
  fundingProvenanceLabels,
  fundingProvenanceOrder
} from '@/lib/evoia-meta/format';
import { selectFundingProvenanceByCategory } from '@/lib/evoia-meta/selectors';
import type { EvoiaMetaProject, FundingProvenance } from '@/lib/evoia-meta/schema';
import { useElementSize } from '@/lib/utils/useElementSize';
import { usePrefersReducedMotion } from '@/lib/utils/usePrefersReducedMotion';

type FundingProvenanceByCategoryProps = {
  projects: EvoiaMetaProject[];
  className?: string;
};

type HoveredSegment = {
  category: string;
  fundingProvenance: FundingProvenance;
  count: number;
  share: number;
};

function numberData(element: Element, key: string, fallback = 0): number {
  const value = Number((element as HTMLElement).dataset[key]);
  return Number.isFinite(value) ? value : fallback;
}

export default function FundingProvenanceByCategory({ projects, className }: FundingProvenanceByCategoryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<SVGGElement>(null);
  const rowsRef = useRef<SVGGElement>(null);
  const [hoveredSegment, setHoveredSegment] = useState<HoveredSegment | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { width: measuredWidth } = useElementSize(containerRef, { width: 900, height: 0 });
  const transitionMs = reducedMotion ? 0 : 280;

  const rows = useMemo(() => selectFundingProvenanceByCategory(projects), [projects]);

  const margin = {
    top: 40,
    right: 90,
    bottom: 22,
    left: Math.max(170, Math.min(250, Math.round((measuredWidth || 900) * 0.28)))
  };
  const innerWidth = Math.max(420, (measuredWidth || 900) - margin.left - margin.right);
  const rowHeight = 31;
  const innerHeight = Math.max(220, rows.length * rowHeight);
  const svgWidth = margin.left + innerWidth + margin.right;
  const svgHeight = margin.top + innerHeight + margin.bottom;

  const xScale = useMemo(() => scaleLinear().domain([0, 1]).range([0, innerWidth]), [innerWidth]);
  const yScale = useMemo(() => {
    return scaleBand<string>().domain(rows.map((row) => row.category)).range([0, innerHeight]).paddingInner(0.2);
  }, [rows, innerHeight]);
  const tickValues = useMemo(() => [0, 0.25, 0.5, 0.75, 1], []);

  useEffect(() => {
    if (!axisRef.current) {
      return;
    }

    const axisSelection = select(axisRef.current);
    const axis = axisTop(xScale)
      .tickValues(tickValues)
      .tickSizeOuter(0)
      .tickFormat((value) => formatPercent(Number(value)));

    axisSelection.transition().duration(transitionMs).ease(easeCubicOut).call(axis);
    axisSelection.select('.domain').attr('stroke', 'var(--color-swatch-gray-3)');
    axisSelection.selectAll<SVGLineElement, unknown>('.tick line').attr('stroke', 'var(--color-swatch-gray-2)').attr('y2', 6);
    axisSelection
      .selectAll<SVGTextElement, unknown>('.tick text')
      .attr('fill', 'var(--color-muted)')
      .attr('font-size', 11)
      .attr('font-family', 'var(--font-sans)');
  }, [xScale, tickValues, transitionMs]);

  useEffect(() => {
    if (!rowsRef.current) {
      return;
    }

    const rowsSelection = select(rowsRef.current);
    rowsSelection
      .selectAll<SVGGElement, unknown>('g.provenance-row')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('transform', function updateRowY() {
        const y = numberData(this, 'targetY');
        return `translate(0, ${y})`;
      });

    rowsSelection
      .selectAll<SVGRectElement, unknown>('rect.provenance-segment')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('x', function updateSegmentX() {
        return numberData(this, 'targetX');
      })
      .attr('width', function updateSegmentWidth() {
        return numberData(this, 'targetWidth');
      });
  }, [rows, transitionMs]);

  const wrapperClassName = ['evoia-funding-provenance', className].filter(Boolean).join(' ');

  return (
    <section
      className={wrapperClassName}
      style={{
        border: '1px solid var(--color-rule)',
        background: 'var(--color-surface)',
        padding: '0.9rem 1rem 1rem'
      }}
    >
      <header
        style={{
          display: 'grid',
          gap: '0.35rem',
          marginBottom: '0.75rem'
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.72rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)'
          }}
        >
          Funding provenance by category
        </p>

        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--color-muted)' }}>
          {hoveredSegment
            ? `${hoveredSegment.category}: ${fundingProvenanceLabels[hoveredSegment.fundingProvenance]} ${hoveredSegment.count} (${formatPercent(hoveredSegment.share)})`
            : 'Hover a segment for count and share.'}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem 1rem' }}>
          {fundingProvenanceOrder.map((fundingProvenance) => (
            <span
              key={fundingProvenance}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--color-muted)' }}
            >
              <span
                aria-hidden
                style={{
                  width: '0.7rem',
                  height: '0.7rem',
                  background: fundingProvenanceColors[fundingProvenance],
                  border: '1px solid var(--color-rule)',
                  display: 'inline-block'
                }}
              />
              {fundingProvenanceLabels[fundingProvenance]}
            </span>
          ))}
        </div>
      </header>

      <div ref={containerRef} style={{ width: '100%', overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <p style={{ margin: '0.4rem 0 0', color: 'var(--color-muted)', fontSize: '0.9rem' }}>
            No provenance rows available.
          </p>
        ) : (
          <svg
            width={svgWidth}
            height={svgHeight}
            role="img"
            aria-label="100 percent stacked bars by category showing funding provenance project shares"
          >
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {tickValues.map((tickValue) => (
                <line
                  key={`grid-${tickValue}`}
                  x1={xScale(tickValue)}
                  x2={xScale(tickValue)}
                  y1={0}
                  y2={innerHeight}
                  stroke="var(--color-swatch-gray-1)"
                  strokeWidth={1}
                />
              ))}

              <g ref={axisRef} transform="translate(0, 0)" />

              <g ref={rowsRef}>
                {rows.map((row) => {
                  const y = yScale(row.category) ?? 0;
                  const barHeight = yScale.bandwidth();
                  let offset = 0;

                  return (
                    <g key={row.category} className="provenance-row" data-target-y={y} transform={`translate(0, ${y})`}>
                      <text
                        x={-12}
                        y={barHeight / 2}
                        dy="0.32em"
                        textAnchor="end"
                        fontFamily="var(--font-sans)"
                        fontSize={12}
                        fill="var(--color-text)"
                      >
                        {row.category}
                      </text>

                      <rect
                        x={0}
                        y={0}
                        width={innerWidth}
                        height={barHeight}
                        fill="var(--color-surface-soft)"
                        stroke="var(--color-rule)"
                        strokeWidth={0.8}
                      />

                      {fundingProvenanceOrder.map((fundingProvenance) => {
                        const share = row.shares[fundingProvenance];
                        const count = row.counts[fundingProvenance];
                        const xStart = xScale(offset);
                        const width = xScale(offset + share) - xScale(offset);
                        offset += share;

                        const hasInlineLabel = share >= 0.22;

                        return (
                          <g key={`${row.category}-${fundingProvenance}`}>
                            <rect
                              className="provenance-segment"
                              x={xStart}
                              y={0}
                              width={width}
                              height={barHeight}
                              fill={fundingProvenanceColors[fundingProvenance]}
                              stroke="var(--color-surface)"
                              strokeWidth={hoveredSegment?.category === row.category && hoveredSegment.fundingProvenance === fundingProvenance ? 1.3 : 0.8}
                              data-target-x={xStart}
                              data-target-width={width}
                              onMouseEnter={() =>
                                setHoveredSegment({
                                  category: row.category,
                                  fundingProvenance,
                                  count,
                                  share
                                })
                              }
                              onMouseLeave={() => setHoveredSegment((current) => (current?.category === row.category ? null : current))}
                            >
                              <title>
                                {`${row.category} — ${fundingProvenanceLabels[fundingProvenance]}: ${count} (${formatPercent(share)})`}
                              </title>
                            </rect>

                            {hasInlineLabel ? (
                              <text
                                x={xStart + width / 2}
                                y={barHeight / 2}
                                dy="0.32em"
                                textAnchor="middle"
                                fontFamily="var(--font-sans)"
                                fontSize={10}
                                fill="#ffffff"
                              >
                                {formatPercent(share)}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}

                      <text
                        x={innerWidth + 8}
                        y={barHeight / 2}
                        dy="0.32em"
                        textAnchor="start"
                        fontFamily="var(--font-sans)"
                        fontSize={11}
                        fill="var(--color-muted)"
                      >
                        {formatProjectCount(row.totalProjects)}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
        )}
      </div>
    </section>
  );
}
