import {
  axisBottom,
  easeCubicOut,
  max,
  scaleBand,
  scaleTime,
  select,
  timeFormat,
  timeMonth,
  type ScaleTime
} from 'd3';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useElementSize } from '@/lib/utils/useElementSize';
import { usePrefersReducedMotion } from '@/lib/utils/usePrefersReducedMotion';
import type { EvoiaMetaProject, FundingProvenance, TimelineStatus } from '@/lib/evoia-meta/schema';

export type HorizonTimelineStep = 'table' | 'bars' | 'today-line' | 'status-color' | 'funding-split';

type HorizonTimelineProps = {
  projects: EvoiaMetaProject[];
  step: HorizonTimelineStep;
  selectedProjectId?: string | null;
  onSelectedProjectChange?: (projectId: string | null) => void;
  todayISO?: string;
  className?: string;
};

type LayoutEntry =
  | {
      kind: 'section';
      id: string;
      label: string;
      y: number;
    }
  | {
      kind: 'row';
      id: string;
      y: number;
      project: EvoiaMetaProject;
      barX: number;
      barWidth: number;
      barColor: string;
      barOpacity: number;
      timelineLabelOpacity: number;
      tableLabelOpacity: number;
      timelineEndLabel: string;
      tableCells: {
        tag: string;
        title: string;
        category: string;
        fundedBy: string;
        end: string;
        status: string;
      };
    };

type Layout = {
  entries: LayoutEntry[];
  rowCount: number;
  contentHeight: number;
  axisY: number;
  tableHeaderY: number;
  chartWidth: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  xScale: ScaleTime<number, number>;
  xTicks: Date[];
  showTimelineAxis: boolean;
  showTodayLine: boolean;
  todayX: number;
  baselineX: number;
};

const BASELINE_DATE = new Date(Date.UTC(2021, 7, 3));
const FUNDING_ORDER: FundingProvenance[] = ['public', 'private_philanthropy', 'mixed_unclear'];
const FUNDING_LABELS: Record<FundingProvenance, string> = {
  public: 'Public funding',
  private_philanthropy: 'Private / philanthropy',
  mixed_unclear: 'Mixed / unclear funding'
};
const STATUS_ORDER: Record<TimelineStatus, number> = {
  completed: 0,
  past_due_unfinished: 1,
  ongoing: 2,
  undated: 3
};
const STATUS_LABELS: Record<TimelineStatus, string> = {
  completed: 'Completed',
  past_due_unfinished: 'Past due, unfinished',
  ongoing: 'Ongoing',
  undated: 'Undated'
};
const STATUS_COLORS: Record<TimelineStatus, string> = {
  completed: '#3547aa',
  past_due_unfinished: '#c74949',
  ongoing: '#868ea0',
  undated: '#b2b8c6'
};
const FUNDING_COLORS: Record<FundingProvenance, string> = {
  public: '#273891',
  private_philanthropy: '#c74949',
  mixed_unclear: '#9ca4b4'
};

const formatAxisDate = timeFormat('%Y');
const formatReadableDate = timeFormat('%d %b %Y');
const euroFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
});

function parseIsoDate(isoDate: string | null): Date | null {
  if (!isoDate) {
    return null;
  }

  const parsed = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isUsableDatedProject(project: EvoiaMetaProject): boolean {
  return project.hasUsableEndDate && Boolean(project.indicativeEndDateISO);
}

function compareBySortRules(a: EvoiaMetaProject, b: EvoiaMetaProject): number {
  const categoryComparison = a.category.localeCompare(b.category, undefined, { sensitivity: 'base' });
  if (categoryComparison !== 0) {
    return categoryComparison;
  }

  const statusComparison = STATUS_ORDER[a.timelineStatus] - STATUS_ORDER[b.timelineStatus];
  if (statusComparison !== 0) {
    return statusComparison;
  }

  const aDate = a.indicativeEndDateISO ?? '9999-12-31';
  const bDate = b.indicativeEndDateISO ?? '9999-12-31';
  if (aDate !== bDate) {
    return aDate.localeCompare(bDate);
  }

  return a.tag.localeCompare(b.tag, undefined, { numeric: true, sensitivity: 'base' });
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(1, maxLength - 1))}\u2026`;
}

function statusOrFundingColor(step: HorizonTimelineStep, project: EvoiaMetaProject): string {
  if (step === 'status-color') {
    return STATUS_COLORS[project.timelineStatus];
  }
  if (step === 'funding-split') {
    return FUNDING_COLORS[project.fundingProvenance];
  }
  return '#8a92a5';
}

function parseToday(todayISO?: string): Date {
  if (todayISO) {
    const parsed = new Date(`${todayISO}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function numberData(element: Element, key: string, fallback = 0): number {
  const value = Number((element as HTMLElement).dataset[key]);
  return Number.isFinite(value) ? value : fallback;
}

function stringData(element: Element, key: string, fallback = ''): string {
  const value = (element as HTMLElement).dataset[key];
  return value ?? fallback;
}

function buildLayout(
  projects: EvoiaMetaProject[],
  step: HorizonTimelineStep,
  width: number,
  todayDate: Date
): Layout {
  const timelineActive = step !== 'table';
  const showTodayLine = step === 'today-line' || step === 'status-color' || step === 'funding-split';

  const margin = {
    top: 30,
    right: 24,
    bottom: 38,
    left: Math.max(160, Math.min(280, Math.round(width * 0.28)))
  };

  const chartWidth = Math.max(520, width - margin.left - margin.right);
  const sorted = [...projects].sort(compareBySortRules);

  const dated = sorted.filter(isUsableDatedProject);
  const undated = sorted.filter((project) => !isUsableDatedProject(project));

  const datedEndMax = max(dated, (project) => parseIsoDate(project.indicativeEndDateISO)?.getTime() ?? 0);
  const domainEnd = timeMonth.offset(new Date(Math.max(datedEndMax ?? 0, todayDate.getTime())), 3);
  const xScale: ScaleTime<number, number> = scaleTime<number, number>().domain([BASELINE_DATE, domainEnd]).range([0, chartWidth]);

  const entriesInput: Array<{ kind: 'section'; id: string; label: string } | { kind: 'row'; id: string; project: EvoiaMetaProject }> = [];

  if (step === 'funding-split' && timelineActive) {
    FUNDING_ORDER.forEach((fundingProvenance) => {
      const group = dated.filter((project) => project.fundingProvenance === fundingProvenance);
      if (group.length === 0) {
        return;
      }

      entriesInput.push({
        kind: 'section',
        id: `section-${fundingProvenance}`,
        label: FUNDING_LABELS[fundingProvenance]
      });

      group.forEach((project) => {
        entriesInput.push({
          kind: 'row',
          id: project.id,
          project
        });
      });
    });
  } else if (timelineActive) {
    dated.forEach((project) => {
      entriesInput.push({
        kind: 'row',
        id: project.id,
        project
      });
    });
  } else {
    sorted.forEach((project) => {
      entriesInput.push({
        kind: 'row',
        id: project.id,
        project
      });
    });
  }

  if (timelineActive && undated.length > 0) {
    entriesInput.push({
      kind: 'section',
      id: 'section-undated',
      label: 'No published end date'
    });

    undated.forEach((project) => {
      entriesInput.push({
        kind: 'row',
        id: project.id,
        project
      });
    });
  }

  const rowStep = step === 'table' ? 24 : 22;
  const yScale = scaleBand<string>()
    .domain(entriesInput.map((entry) => entry.id))
    .range([0, entriesInput.length * rowStep])
    .paddingInner(0.14)
    .paddingOuter(0.08);

  const entries: LayoutEntry[] = entriesInput.map((entry) => {
    const y = (yScale(entry.id) ?? 0) + yScale.bandwidth() / 2;

    if (entry.kind === 'section') {
      return {
        ...entry,
        y
      };
    }

    const { project } = entry;
    const endDate = parseIsoDate(project.indicativeEndDateISO);
    const timelineBarWidth =
      endDate && isUsableDatedProject(project) ? Math.max(2, xScale(endDate) - xScale(BASELINE_DATE)) : 34;
    const timelineBarX = endDate && isUsableDatedProject(project) ? xScale(BASELINE_DATE) : 12;

    const tableTitleLength = chartWidth > 980 ? 54 : chartWidth > 800 ? 42 : 32;
    return {
      kind: 'row',
      id: project.id,
      y,
      project,
      barX: timelineBarX,
      barWidth: timelineBarWidth,
      barColor: statusOrFundingColor(step, project),
      barOpacity: timelineActive ? 0.95 : 0,
      timelineLabelOpacity: timelineActive ? 1 : 0,
      tableLabelOpacity: timelineActive ? 0 : 1,
      timelineEndLabel: endDate ? formatReadableDate(endDate) : 'No published end date',
      tableCells: {
        tag: project.tag,
        title: truncateText(project.displayTitle, tableTitleLength),
        category: truncateText(project.category, 20),
        fundedBy: truncateText(project.fundedByRaw ?? 'Unspecified', 34),
        end: project.indicativeCompletionRaw ?? '—',
        status: STATUS_LABELS[project.timelineStatus]
      }
    };
  });

  const rowCount = entries.filter((entry) => entry.kind === 'row').length;
  const contentHeight = Math.max(280, yScale.range()[1] + 24);
  const axisY = contentHeight - 12;
  const tableHeaderY = 10;
  const xTicks = xScale.ticks(chartWidth > 900 ? 10 : chartWidth > 700 ? 8 : 6);

  return {
    entries,
    rowCount,
    contentHeight,
    axisY,
    tableHeaderY,
    chartWidth,
    margin,
    xScale,
    xTicks,
    showTimelineAxis: timelineActive,
    showTodayLine,
    todayX: xScale(todayDate),
    baselineX: xScale(BASELINE_DATE)
  };
}

export default function HorizonTimeline({
  projects,
  step,
  selectedProjectId,
  onSelectedProjectChange,
  todayISO,
  className
}: HorizonTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<SVGGElement>(null);
  const rowsRef = useRef<SVGGElement>(null);
  const todayLineRef = useRef<SVGLineElement>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [internalSelectedProjectId, setInternalSelectedProjectId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { width: measuredWidth } = useElementSize(containerRef, { width: 1100, height: 0 });

  const activeSelectedProjectId = selectedProjectId === undefined ? internalSelectedProjectId : selectedProjectId;
  const chartContainerWidth = Math.max(760, measuredWidth || 0);
  const todayDate = useMemo(() => parseToday(todayISO), [todayISO]);
  const layout = useMemo(() => buildLayout(projects, step, chartContainerWidth, todayDate), [projects, step, chartContainerWidth, todayDate]);

  const svgWidth = layout.margin.left + layout.chartWidth + layout.margin.right;
  const svgHeight = layout.margin.top + layout.contentHeight + layout.margin.bottom;
  const transitionMs = reducedMotion ? 0 : 320;

  useEffect(() => {
    if (!axisRef.current) {
      return;
    }

    const axisSelection = select(axisRef.current);
    const axis = axisBottom(layout.xScale)
      .tickValues(layout.xTicks)
      .tickSizeOuter(0)
      .tickFormat((value) => formatAxisDate(value as Date));

    axisSelection
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('opacity', layout.showTimelineAxis ? 1 : 0)
      .call(axis);

    axisSelection.select('.domain').attr('stroke', 'var(--color-swatch-gray-3)');
    axisSelection.selectAll<SVGLineElement, unknown>('.tick line').attr('stroke', 'var(--color-swatch-gray-2)').attr('y2', 6);
    axisSelection
      .selectAll<SVGTextElement, unknown>('.tick text')
      .attr('fill', 'var(--color-muted)')
      .attr('font-size', 11)
      .attr('font-family', 'var(--font-sans)');
  }, [layout.xScale, layout.xTicks, layout.showTimelineAxis, transitionMs]);

  useEffect(() => {
    if (!rowsRef.current) {
      return;
    }

    const rowsSelection = select(rowsRef.current);

    rowsSelection
      .selectAll<SVGGElement, unknown>('g.horizon-row')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('transform', function updateRowTransform() {
        const y = numberData(this, 'targetY');
        return `translate(0, ${y})`;
      });

    rowsSelection
      .selectAll<SVGRectElement, unknown>('rect.horizon-row-background')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('opacity', function updateRowBackground() {
        return numberData(this, 'targetOpacity');
      });

    rowsSelection
      .selectAll<SVGRectElement, unknown>('rect.horizon-bar')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('x', function updateBarX() {
        return numberData(this, 'targetX');
      })
      .attr('width', function updateBarWidth() {
        return numberData(this, 'targetWidth');
      })
      .attr('fill', function updateBarFill() {
        return stringData(this, 'targetFill', '#8a92a5');
      })
      .attr('opacity', function updateBarOpacity() {
        return numberData(this, 'targetOpacity');
      });

    rowsSelection
      .selectAll<SVGTextElement, unknown>('text.horizon-timeline-label')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('opacity', function updateTimelineLabelOpacity() {
        return numberData(this, 'targetOpacity');
      });

    rowsSelection
      .selectAll<SVGTextElement, unknown>('text.horizon-end-label')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('opacity', function updateTimelineEndOpacity() {
        return numberData(this, 'targetOpacity');
      });

    rowsSelection
      .selectAll<SVGTextElement, unknown>('text.horizon-table-cell')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('opacity', function updateTableLabelOpacity() {
        return numberData(this, 'targetOpacity');
      });
  }, [layout.entries, transitionMs]);

  useEffect(() => {
    if (!todayLineRef.current) {
      return;
    }

    select(todayLineRef.current)
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('x1', layout.todayX)
      .attr('x2', layout.todayX)
      .attr('opacity', layout.showTodayLine ? 1 : 0);
  }, [layout.showTodayLine, layout.todayX, transitionMs]);

  const selectProject = (projectId: string) => {
    const nextProjectId = activeSelectedProjectId === projectId ? null : projectId;
    if (selectedProjectId === undefined) {
      setInternalSelectedProjectId(nextProjectId);
    }
    onSelectedProjectChange?.(nextProjectId);
  };

  const handleRowKeyDown = (event: KeyboardEvent<SVGGElement>, projectId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    selectProject(projectId);
  };

  const wrapperClassName = ['evoia-horizon-timeline', className].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={wrapperClassName}
      style={{
        border: '1px solid var(--color-rule)',
        background: 'var(--color-surface)',
        overflow: 'auto',
        maxHeight: '78vh',
        minHeight: '36rem'
      }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label="Published horizon timeline for Evia Meta reconstruction projects"
      >
        <g transform={`translate(${layout.margin.left}, ${layout.margin.top})`}>
          <text
            x={0}
            y={-14}
            fontSize={11}
            fill="var(--color-muted)"
            fontFamily="var(--font-sans)"
            letterSpacing="0.04em"
          >
            Published horizon baseline: {formatReadableDate(BASELINE_DATE)}
          </text>

          <line
            x1={layout.baselineX}
            x2={layout.baselineX}
            y1={0}
            y2={layout.contentHeight}
            stroke="var(--color-swatch-gray-3)"
            strokeDasharray="2 3"
            opacity={layout.showTimelineAxis ? 1 : 0}
          />

          <g transform={`translate(0, ${layout.tableHeaderY})`}>
            <text
              x={0}
              y={0}
              fontSize={11}
              fontFamily="var(--font-sans)"
              fill="var(--color-muted)"
              letterSpacing="0.04em"
              opacity={step === 'table' ? 1 : 0}
            >
              TAG
            </text>
            <text
              x={68}
              y={0}
              fontSize={11}
              fontFamily="var(--font-sans)"
              fill="var(--color-muted)"
              letterSpacing="0.04em"
              opacity={step === 'table' ? 1 : 0}
            >
              TITLE
            </text>
            <text
              x={layout.chartWidth * 0.44}
              y={0}
              fontSize={11}
              fontFamily="var(--font-sans)"
              fill="var(--color-muted)"
              letterSpacing="0.04em"
              opacity={step === 'table' ? 1 : 0}
            >
              CATEGORY
            </text>
            <text
              x={layout.chartWidth * 0.60}
              y={0}
              fontSize={11}
              fontFamily="var(--font-sans)"
              fill="var(--color-muted)"
              letterSpacing="0.04em"
              opacity={step === 'table' ? 1 : 0}
            >
              FUNDED BY
            </text>
            <text
              x={layout.chartWidth * 0.84}
              y={0}
              fontSize={11}
              fontFamily="var(--font-sans)"
              fill="var(--color-muted)"
              letterSpacing="0.04em"
              opacity={step === 'table' ? 1 : 0}
            >
              INDICATIVE END
            </text>
            <text
              x={layout.chartWidth * 0.94}
              y={0}
              fontSize={11}
              fontFamily="var(--font-sans)"
              fill="var(--color-muted)"
              letterSpacing="0.04em"
              opacity={step === 'table' ? 1 : 0}
            >
              STATUS
            </text>
          </g>

          {layout.xTicks.map((tick) => (
            <line
              key={`grid-${tick.toISOString()}`}
              x1={layout.xScale(tick)}
              x2={layout.xScale(tick)}
              y1={0}
              y2={layout.axisY - 8}
              stroke="var(--color-swatch-gray-1)"
              strokeWidth={1}
              opacity={layout.showTimelineAxis ? 1 : 0}
            />
          ))}

          {layout.entries
            .filter((entry): entry is Extract<LayoutEntry, { kind: 'section' }> => entry.kind === 'section')
            .map((entry) => (
              <g key={entry.id} transform={`translate(0, ${entry.y})`} opacity={step === 'table' ? 0 : 1}>
                <line x1={0} x2={layout.chartWidth} y1={0} y2={0} stroke="var(--color-swatch-gray-3)" strokeDasharray="3 3" />
                <text
                  x={6}
                  y={-5}
                  fontSize={11}
                  fontFamily="var(--font-sans)"
                  fill="var(--color-muted)"
                  letterSpacing="0.04em"
                >
                  {entry.label}
                </text>
              </g>
            ))}

          <g ref={rowsRef}>
            {layout.entries
              .filter((entry): entry is Extract<LayoutEntry, { kind: 'row' }> => entry.kind === 'row')
              .map((entry) => {
                const isSelected = activeSelectedProjectId === entry.project.id;
                const isHovered = hoveredProjectId === entry.project.id;
                const isFocused = isSelected || isHovered;
                const rowOpacity = isFocused ? 1 : 0;

                return (
                  <g
                    key={entry.id}
                    className="horizon-row"
                    role="button"
                    tabIndex={0}
                    aria-label={`${entry.project.tag} ${entry.project.displayTitle}`}
                    aria-pressed={isSelected}
                    data-target-y={entry.y}
                    onClick={() => selectProject(entry.project.id)}
                    onKeyDown={(event) => handleRowKeyDown(event, entry.project.id)}
                    onMouseEnter={() => setHoveredProjectId(entry.project.id)}
                    onMouseLeave={() => setHoveredProjectId((current) => (current === entry.project.id ? null : current))}
                  >
                    <rect
                      className="horizon-row-background"
                      x={-layout.margin.left + 2}
                      y={-9}
                      width={layout.chartWidth + layout.margin.left - 4}
                      height={18}
                      fill={isSelected ? 'var(--color-surface-muted)' : 'var(--color-surface-soft)'}
                      opacity={0}
                      data-target-opacity={rowOpacity}
                    />

                    <rect
                      className="horizon-bar"
                      y={-6}
                      height={12}
                      rx={2}
                      ry={2}
                      fill={entry.barColor}
                      stroke={isFocused ? 'var(--color-swatch-blue-2)' : 'var(--color-swatch-gray-6)'}
                      strokeWidth={isFocused ? 1.2 : 0.6}
                      opacity={0}
                      data-target-x={entry.barX}
                      data-target-width={entry.barWidth}
                      data-target-fill={entry.barColor}
                      data-target-opacity={entry.barOpacity}
                    />

                    <text
                      className="horizon-timeline-label"
                      x={-10}
                      y={0}
                      dy="0.32em"
                      textAnchor="end"
                      fontFamily="var(--font-sans)"
                      fontSize={12}
                      fontWeight={isSelected ? 700 : 500}
                      fill={isFocused ? 'var(--color-text)' : 'var(--color-swatch-blue-2)'}
                      opacity={0}
                      data-target-opacity={entry.timelineLabelOpacity}
                    >
                      {truncateText(`${entry.project.tag}  ${entry.project.displayTitle}`, 66)}
                    </text>

                    <text
                      className="horizon-end-label"
                      x={Math.min(layout.chartWidth - 8, entry.barX + entry.barWidth + 6)}
                      y={0}
                      dy="0.32em"
                      fontFamily="var(--font-sans)"
                      fontSize={11}
                      fill="var(--color-muted)"
                      opacity={0}
                      data-target-opacity={entry.timelineLabelOpacity}
                    >
                      {entry.timelineEndLabel}
                    </text>

                    <text
                      className="horizon-table-cell"
                      x={0}
                      y={0}
                      dy="0.32em"
                      fontFamily="var(--font-sans)"
                      fontSize={12}
                      fill="var(--color-text)"
                      opacity={0}
                      data-target-opacity={entry.tableLabelOpacity}
                    >
                      {entry.tableCells.tag}
                    </text>
                    <text
                      className="horizon-table-cell"
                      x={68}
                      y={0}
                      dy="0.32em"
                      fontFamily="var(--font-sans)"
                      fontSize={12}
                      fill="var(--color-text)"
                      opacity={0}
                      data-target-opacity={entry.tableLabelOpacity}
                    >
                      {entry.tableCells.title}
                    </text>
                    <text
                      className="horizon-table-cell"
                      x={layout.chartWidth * 0.44}
                      y={0}
                      dy="0.32em"
                      fontFamily="var(--font-sans)"
                      fontSize={12}
                      fill="var(--color-muted)"
                      opacity={0}
                      data-target-opacity={entry.tableLabelOpacity}
                    >
                      {entry.tableCells.category}
                    </text>
                    <text
                      className="horizon-table-cell"
                      x={layout.chartWidth * 0.6}
                      y={0}
                      dy="0.32em"
                      fontFamily="var(--font-sans)"
                      fontSize={12}
                      fill="var(--color-muted)"
                      opacity={0}
                      data-target-opacity={entry.tableLabelOpacity}
                    >
                      {entry.tableCells.fundedBy}
                    </text>
                    <text
                      className="horizon-table-cell"
                      x={layout.chartWidth * 0.84}
                      y={0}
                      dy="0.32em"
                      fontFamily="var(--font-sans)"
                      fontSize={12}
                      fill="var(--color-muted)"
                      opacity={0}
                      data-target-opacity={entry.tableLabelOpacity}
                    >
                      {entry.tableCells.end}
                    </text>
                    <text
                      className="horizon-table-cell"
                      x={layout.chartWidth * 0.94}
                      y={0}
                      dy="0.32em"
                      fontFamily="var(--font-sans)"
                      fontSize={12}
                      fill="var(--color-muted)"
                      opacity={0}
                      data-target-opacity={entry.tableLabelOpacity}
                    >
                      {entry.tableCells.status}
                    </text>
                  </g>
                );
              })}
          </g>

          <line
            ref={todayLineRef}
            x1={layout.todayX}
            x2={layout.todayX}
            y1={0}
            y2={layout.axisY - 8}
            stroke="var(--color-accent)"
            strokeWidth={1.4}
            strokeDasharray="4 3"
            opacity={layout.showTodayLine ? 1 : 0}
          />
          <text
            x={layout.todayX + 6}
            y={16}
            fontSize={11}
            fontFamily="var(--font-sans)"
            fill="var(--color-accent)"
            opacity={layout.showTodayLine ? 1 : 0}
          >
            Today
          </text>

          <g ref={axisRef} transform={`translate(0, ${layout.axisY})`} opacity={layout.showTimelineAxis ? 1 : 0} />

          <text
            x={layout.chartWidth}
            y={layout.contentHeight + 18}
            textAnchor="end"
            fontSize={11}
            fontFamily="var(--font-sans)"
            fill="var(--color-muted)"
          >
            {layout.rowCount} projects · Total announced budget {euroFormatter.format(projects.reduce((sum, project) => sum + (project.announcedBudget ?? 0), 0))}
          </text>
        </g>
      </svg>
    </div>
  );
}
