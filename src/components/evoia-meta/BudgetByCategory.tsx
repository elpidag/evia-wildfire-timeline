import { axisTop, easeCubicOut, max, scaleBand, scaleLinear, select } from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatEuro, formatEuroCompact, formatProjectCount } from '@/lib/evoia-meta/format';
import { selectBudgetByCategory } from '@/lib/evoia-meta/selectors';
import type { EvoiaMetaProject } from '@/lib/evoia-meta/schema';
import { useElementSize } from '@/lib/utils/useElementSize';
import { usePrefersReducedMotion } from '@/lib/utils/usePrefersReducedMotion';

type BudgetByCategoryProps = {
  projects: EvoiaMetaProject[];
  includeMegaProjects?: boolean;
  onIncludeMegaProjectsChange?: (includeMegaProjects: boolean) => void;
  className?: string;
};

function numberData(element: Element, key: string, fallback = 0): number {
  const value = Number((element as HTMLElement).dataset[key]);
  return Number.isFinite(value) ? value : fallback;
}

export default function BudgetByCategory({
  projects,
  includeMegaProjects,
  onIncludeMegaProjectsChange,
  className
}: BudgetByCategoryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<SVGGElement>(null);
  const rowsRef = useRef<SVGGElement>(null);
  const [internalIncludeMegaProjects, setInternalIncludeMegaProjects] = useState(true);
  const reducedMotion = usePrefersReducedMotion();
  const { width: measuredWidth } = useElementSize(containerRef, { width: 900, height: 0 });
  const transitionMs = reducedMotion ? 0 : 280;

  const includeMega = includeMegaProjects ?? internalIncludeMegaProjects;
  const rows = useMemo(
    () => selectBudgetByCategory(projects, { includeMegaProjects: includeMega }),
    [projects, includeMega]
  );

  const margin = {
    top: 38,
    right: 140,
    bottom: 24,
    left: Math.max(170, Math.min(250, Math.round((measuredWidth || 900) * 0.28)))
  };
  const innerWidth = Math.max(420, (measuredWidth || 900) - margin.left - margin.right);
  const rowHeight = 31;
  const innerHeight = Math.max(220, rows.length * rowHeight);
  const svgWidth = margin.left + innerWidth + margin.right;
  const svgHeight = margin.top + innerHeight + margin.bottom;

  const xScale = useMemo(() => {
    const budgetMax = max(rows, (row) => row.totalBudget) ?? 0;
    return scaleLinear().domain([0, budgetMax > 0 ? budgetMax : 1]).range([0, innerWidth]).nice();
  }, [rows, innerWidth]);

  const yScale = useMemo(() => {
    return scaleBand<string>().domain(rows.map((row) => row.category)).range([0, innerHeight]).paddingInner(0.22);
  }, [rows, innerHeight]);

  const tickValues = useMemo(() => xScale.ticks(innerWidth > 720 ? 7 : 5), [xScale, innerWidth]);
  const totalVisibleBudget = useMemo(
    () => rows.reduce((sum, row) => sum + row.totalBudget, 0),
    [rows]
  );

  useEffect(() => {
    if (!axisRef.current) {
      return;
    }

    const axisSelection = select(axisRef.current);
    const axis = axisTop(xScale)
      .tickValues(tickValues)
      .tickSizeOuter(0)
      .tickFormat((value) => formatEuroCompact(Number(value)));

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
      .selectAll<SVGGElement, unknown>('g.budget-row')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('transform', function updateRowY() {
        const y = numberData(this, 'targetY');
        return `translate(0, ${y})`;
      });

    rowsSelection
      .selectAll<SVGRectElement, unknown>('rect.budget-bar')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('width', function updateBarWidth() {
        return numberData(this, 'targetWidth');
      });

    rowsSelection
      .selectAll<SVGTextElement, unknown>('text.budget-value')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('x', function updateLabelX() {
        return numberData(this, 'targetX');
      });
  }, [rows, transitionMs]);

  const setIncludeMega = (nextValue: boolean) => {
    if (includeMegaProjects === undefined) {
      setInternalIncludeMegaProjects(nextValue);
    }
    onIncludeMegaProjectsChange?.(nextValue);
  };

  const wrapperClassName = ['evoia-budget-by-category', className].filter(Boolean).join(' ');

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
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '0.75rem'
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: '0.72rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)'
            }}
          >
            Budget by category
          </p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
            Visible total: {formatEuro(totalVisibleBudget)}
          </p>
        </div>

        <div
          role="group"
          aria-label="Budget visibility mode"
          style={{ display: 'inline-flex', border: '1px solid var(--color-rule)', background: 'var(--color-surface-soft)' }}
        >
          <button
            type="button"
            aria-pressed={includeMega}
            onClick={() => setIncludeMega(true)}
            style={{
              border: 'none',
              borderRight: '1px solid var(--color-rule)',
              background: includeMega ? 'var(--color-swatch-blue-2)' : 'transparent',
              color: includeMega ? '#ffffff' : 'var(--color-text)',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.82rem',
              letterSpacing: '0.04em',
              padding: '0.42rem 0.62rem',
              cursor: 'pointer'
            }}
          >
            Include mega-projects
          </button>
          <button
            type="button"
            aria-pressed={!includeMega}
            onClick={() => setIncludeMega(false)}
            style={{
              border: 'none',
              background: !includeMega ? 'var(--color-swatch-blue-2)' : 'transparent',
              color: !includeMega ? '#ffffff' : 'var(--color-text)',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.82rem',
              letterSpacing: '0.04em',
              padding: '0.42rem 0.62rem',
              cursor: 'pointer'
            }}
          >
            Exclude mega-projects
          </button>
        </div>
      </header>

      <div ref={containerRef} style={{ width: '100%', overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <p style={{ margin: '0.4rem 0 0', color: 'var(--color-muted)', fontSize: '0.9rem' }}>
            No categories are visible for the current filter mode.
          </p>
        ) : (
          <svg width={svgWidth} height={svgHeight} role="img" aria-label="Horizontal bars of announced budget per category">
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
                  const width = xScale(row.totalBudget);
                  const labelInside = width > 126;
                  const labelX = labelInside ? width - 7 : width + 7;
                  const labelAnchor = labelInside ? 'end' : 'start';
                  const labelColor = labelInside ? '#ffffff' : 'var(--color-text)';

                  return (
                    <g key={row.category} className="budget-row" data-target-y={y} transform={`translate(0, ${y})`}>
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

                      <rect
                        className="budget-bar"
                        x={0}
                        y={0}
                        height={barHeight}
                        rx={2}
                        ry={2}
                        fill="var(--color-swatch-blue-2)"
                        width={width}
                        data-target-width={width}
                      />

                      <text
                        className="budget-value"
                        x={labelX}
                        y={barHeight / 2}
                        dy="0.32em"
                        textAnchor={labelAnchor}
                        fontFamily="var(--font-sans)"
                        fontSize={11}
                        fill={labelColor}
                        data-target-x={labelX}
                      >
                        {formatEuro(row.totalBudget)}
                      </text>

                      <text
                        x={innerWidth + 8}
                        y={barHeight / 2}
                        dy="0.32em"
                        textAnchor="start"
                        fontFamily="var(--font-sans)"
                        fontSize={11}
                        fill="var(--color-muted)"
                      >
                        {formatProjectCount(row.projectCount)}
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
