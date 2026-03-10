import { easeCubicOut, select } from 'd3';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/utils/usePrefersReducedMotion';
import type { EvoiaMetaProject } from '@/lib/evoia-meta/schema';
import {
  computeSlideLayout,
  computeTotalFontSize,
  formatBudgetTotal
} from '@/lib/evoia-meta/presentation-layout';
import {
  TRANSITION_MS,
  FONT_DISPLAY,
  FONT_BODY,
  COLOR_TEXT,
  COLOR_CATEGORY_LABEL,
  COLOR_MUTED,
  FUNDING_GROUP_ORDER,
  FUNDING_GROUP_FILLS,
  FUNDING_GROUP_TOTAL_COLORS
} from '@/lib/evoia-meta/presentation-constants';

type AnnouncedProjectsDeckProps = {
  projects: EvoiaMetaProject[];
};

type ColumnOverlay = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  gradientColor: string;
  totalText: string;
  totalX: number;
  totalY: number;
  totalFontSize: number;
  totalColor: string;
};

const TOTAL_SLIDES = 6;

function useViewportSize() {
  const [size, setSize] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    const update = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
  }, []);

  return size;
}

/**
 * Compute column overlay data (gradient rects + budget totals) for Slide 2.
 * These use the same column geometry as the layout engine but are computed
 * independently so they can always exist in the DOM for smooth transitions.
 */
function computeColumnOverlays(
  projects: EvoiaMetaProject[],
  viewportWidth: number,
  viewportHeight: number
): ColumnOverlay[] {
  const filtered = projects.filter((p) => !p.tag.startsWith('B'));

  // Same geometry as layout engine
  const marginX = Math.round(viewportWidth * 0.05);
  const marginTop = Math.round(viewportHeight * 0.035);
  const marginBottom = Math.round(viewportHeight * 0.03);
  const titleFontSize = Math.max(20, Math.min(48, Math.round(viewportWidth * 0.022)));
  const titleAreaHeight = titleFontSize + Math.round(viewportHeight * 0.025);
  const contentTop = marginTop + titleAreaHeight;
  const contentHeight = viewportHeight - contentTop - marginBottom;
  const contentWidth = viewportWidth - marginX * 2;
  const columnGap = Math.round(contentWidth * 0.025);
  const numColumns = 3;
  const totalColumnWidth = contentWidth - columnGap * (numColumns - 1);
  const columnWidth = totalColumnWidth / numColumns;

  const totalFontSize = computeTotalFontSize(viewportWidth);

  // Sum budgets per funding group
  const budgets = new Map<string, number>();
  for (const p of filtered) {
    budgets.set(p.fundingProvenance, (budgets.get(p.fundingProvenance) ?? 0) + (p.announcedBudget ?? 0));
  }

  return FUNDING_GROUP_ORDER.map((key, i) => {
    const colX = marginX + i * (columnWidth + columnGap);
    return {
      key,
      x: colX,
      y: contentTop,
      width: columnWidth,
      height: contentHeight,
      gradientColor: FUNDING_GROUP_FILLS[key] ?? '#e0e0e0',
      totalText: formatBudgetTotal(budgets.get(key) ?? 0),
      totalX: colX + columnWidth / 2,
      totalY: contentTop + contentHeight - totalFontSize * 0.3,
      totalFontSize,
      totalColor: FUNDING_GROUP_TOTAL_COLORS[key] ?? '#909090'
    };
  });
}

export default function AnnouncedProjectsDeck({ projects }: AnnouncedProjectsDeckProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const barsRef = useRef<SVGGElement>(null);
  const labelsRef = useRef<SVGGElement>(null);
  const overlaysRef = useRef<SVGGElement>(null);
  const isFirstRenderRef = useRef(true);
  const [slideIndex, setSlideIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const viewport = useViewportSize();

  const layout = useMemo(
    () => computeSlideLayout(projects, viewport.width, viewport.height, slideIndex),
    [projects, viewport.width, viewport.height, slideIndex]
  );

  const overlays = useMemo(
    () => computeColumnOverlays(projects, viewport.width, viewport.height),
    [projects, viewport.width, viewport.height]
  );

  const transitionMs = reducedMotion ? 0 : TRANSITION_MS;

  // --- Keyboard navigation ---
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          setSlideIndex((current) => Math.min(current + 1, TOTAL_SLIDES - 1));
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          setSlideIndex((current) => Math.max(current - 1, 0));
          break;
        case 'Home':
          event.preventDefault();
          setSlideIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setSlideIndex(TOTAL_SLIDES - 1);
          break;
      }
    },
    []
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // --- D3 transitions on layout change ---
  useLayoutEffect(() => {
    if (!barsRef.current) {
      return;
    }

    const g = select(barsRef.current);
    const duration = isFirstRenderRef.current ? 0 : transitionMs;
    isFirstRenderRef.current = false;

    // Animate bar group positions
    g.selectAll<SVGGElement, unknown>('g.deck-bar')
      .transition()
      .duration(duration)
      .ease(easeCubicOut)
      .attr('transform', function () {
        const x = Number((this as HTMLElement).dataset.targetX) || 0;
        const y = Number((this as HTMLElement).dataset.targetY) || 0;
        return `translate(${x}, ${y})`;
      });

    // Animate bar rectangles
    g.selectAll<SVGRectElement, unknown>('rect.deck-bar-rect')
      .transition()
      .duration(duration)
      .ease(easeCubicOut)
      .attr('width', function () {
        return Number((this as HTMLElement).dataset.targetWidth) || 0;
      })
      .attr('height', function () {
        return Number((this as HTMLElement).dataset.targetHeight) || 0;
      })
      .attr('fill', function () {
        return (this as HTMLElement).dataset.targetFill ?? '#e4e7ed';
      });

    // Animate tag text vertical position and font size
    g.selectAll<SVGTextElement, unknown>('text.deck-bar-tag')
      .transition()
      .duration(duration)
      .ease(easeCubicOut)
      .attr('y', function () {
        return Number((this as HTMLElement).dataset.targetY) || 0;
      })
      .attr('font-size', function () {
        const v = (this as HTMLElement).dataset.targetFontSize;
        return v != null ? Number(v) : 10;
      });

    // Animate title text vertical position, font size, and opacity
    g.selectAll<SVGTextElement, unknown>('text.deck-bar-title')
      .transition()
      .duration(duration)
      .ease(easeCubicOut)
      .attr('y', function () {
        return Number((this as HTMLElement).dataset.targetY) || 0;
      })
      .attr('font-size', function () {
        return Number((this as HTMLElement).dataset.targetFontSize) || 10;
      })
      .attr('opacity', function () {
        return Number((this as HTMLElement).dataset.targetOpacity) ?? 1;
      });

    // Animate budget labels (right of bar) — position, font size, opacity
    g.selectAll<SVGTextElement, unknown>('text.deck-bar-budget')
      .transition()
      .duration(duration)
      .ease(easeCubicOut)
      .attr('x', function () {
        return Number((this as HTMLElement).dataset.targetX) || 0;
      })
      .attr('y', function () {
        return Number((this as HTMLElement).dataset.targetY) || 0;
      })
      .attr('font-size', function () {
        return Number((this as HTMLElement).dataset.targetFontSize) || 10;
      })
      .attr('opacity', function () {
        return Number((this as HTMLElement).dataset.targetOpacity) ?? 0;
      });

    // Animate category labels — position, rotation, fontSize
    if (labelsRef.current) {
      select(labelsRef.current)
        .selectAll<SVGTextElement, unknown>('text.deck-cat-label')
        .each(function () {
          const el = this as SVGTextElement;
          const ds = el.dataset;
          const x = parseFloat(ds.targetX ?? '0');
          const y = parseFloat(ds.targetY ?? '0');
          const r = parseFloat(ds.targetRotation ?? '90');
          const fs = parseFloat(ds.targetFontSize ?? '16');
          const anchor = ds.targetTextAnchor ?? 'middle';
          const s = select(el);

          if (!el.hasAttribute('data-initialized')) {
            // First appearance: position immediately without animation
            el.setAttribute('data-initialized', '1');
            s.attr('transform', `translate(${x}, ${y}) rotate(${r})`)
              .attr('font-size', fs)
              .attr('text-anchor', anchor);
          } else {
            // Animate to new position
            s.attr('text-anchor', anchor);
            s.transition()
              .duration(duration)
              .ease(easeCubicOut)
              .attr('transform', `translate(${x}, ${y}) rotate(${r})`)
              .attr('font-size', fs);
          }
        });
    }

    // Animate column overlays (gradient + totals) opacity
    if (overlaysRef.current) {
      select(overlaysRef.current)
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr('opacity', slideIndex === 2 ? 1 : 0);
    }
  }, [layout, slideIndex, transitionMs]);

  return (
    <svg
      ref={svgRef}
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      style={{ display: 'block', background: '#ffffff' }}
      role="img"
      aria-label="Evia Meta reconstruction announced projects presentation"
    >
      {/* Gradient definitions for column overlays */}
      <defs>
        {overlays.map((overlay) => (
          <linearGradient
            key={overlay.key}
            id={`col-gradient-${overlay.key}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={overlay.gradientColor} stopOpacity={0.03} />
            <stop offset="100%" stopColor={overlay.gradientColor} stopOpacity={0.2} />
          </linearGradient>
        ))}
      </defs>

      {/* Column overlays — gradient rects + budget totals.
          Always in DOM; D3 transitions opacity (0 on Slide 1, 1 on Slide 2). */}
      <g ref={overlaysRef} opacity={0}>
        {overlays.map((overlay) => (
          <g key={overlay.key}>
            <rect
              x={overlay.x}
              y={overlay.y}
              width={overlay.width}
              height={overlay.height}
              fill={`url(#col-gradient-${overlay.key})`}
            />
            <text
              x={overlay.totalX}
              y={overlay.totalY}
              textAnchor="middle"
              fontFamily={FONT_DISPLAY}
              fontSize={overlay.totalFontSize}
              fill={overlay.totalColor}
              letterSpacing="0.01em"
              style={{ pointerEvents: 'none' }}
            >
              {overlay.totalText}
            </text>
          </g>
        ))}
      </g>

      {/* Title */}
      <text
        x={layout.titleX}
        y={layout.titleY}
        fontFamily={layout.titleFontFamily}
        fontSize={layout.titleFontSize}
        fill={COLOR_TEXT}
        letterSpacing="0.004em"
      >
        {layout.titleText}
      </text>

      {/* Category labels — D3 transitions handle position, rotation, fontSize */}
      <g ref={labelsRef}>
        {layout.categoryLabels.map((catLabel) => (
          <text
            key={catLabel.category}
            className="deck-cat-label"
            x={0}
            y={0}
            data-target-x={catLabel.x}
            data-target-y={catLabel.y}
            data-target-rotation={catLabel.rotation ?? 90}
            data-target-font-size={catLabel.fontSize}
            data-target-text-anchor={catLabel.textAnchor ?? 'middle'}
            fontFamily={FONT_DISPLAY}
            fill={COLOR_CATEGORY_LABEL}
            dominantBaseline="central"
            letterSpacing="0.004em"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {catLabel.label}
          </text>
        ))}
      </g>

      {/* Parent group headers / budget totals */}
      {layout.groupHeaders.map((header) => (
        <text
          key={header.key}
          x={header.x}
          y={header.y + header.height / 2}
          dominantBaseline="central"
          fontFamily={header.fontFamily ?? FONT_BODY}
          fontSize={header.fontSize}
          fontWeight={700}
          fill={header.fill ?? COLOR_TEXT}
          letterSpacing={header.fontFamily ? '0.01em' : undefined}
          style={{ pointerEvents: 'none' }}
        >
          {header.text}
        </text>
      ))}

      {/* Project bars — positions/sizes managed entirely by D3 transitions. */}
      <g ref={barsRef}>
        {layout.bars.map((bar) => (
          <g
            key={bar.id}
            className="deck-bar"
            data-target-x={bar.x}
            data-target-y={bar.y}
          >
            <rect
              className="deck-bar-rect"
              x={0}
              y={0}
              data-target-width={bar.width}
              data-target-height={bar.height}
              data-target-fill={bar.fill}
            />

            {/* Tag label (left of bar) */}
            <text
              className="deck-bar-tag"
              x={bar.tagX - bar.x}
              data-target-y={bar.height / 2}
              data-target-font-size={bar.tagFontSize}
              textAnchor="end"
              dominantBaseline="central"
              fontFamily={FONT_DISPLAY}
              fontWeight={600}
              fill={COLOR_TEXT}
              letterSpacing="0.01em"
            >
              {bar.displayTag}
            </text>

            {/* Title text (inside bar) — always rendered, opacity managed by D3 */}
            <text
              className="deck-bar-title"
              x={bar.titleX - bar.x}
              data-target-y={(bar.titleY - bar.y)}
              data-target-font-size={bar.titleFontSize}
              data-target-opacity={bar.titleVisible ? 1 : 0}
              dominantBaseline="central"
              fontFamily={FONT_BODY}
              fill={COLOR_TEXT}
              style={{ pointerEvents: 'none' }}
            >
              {bar.titleLines
                ? bar.titleLines.map((line, lineIdx) => (
                    <tspan
                      key={lineIdx}
                      x={bar.titleX - bar.x}
                      dy={lineIdx === 0 ? 0 : bar.titleLineHeight ?? 0}
                    >
                      {line}
                    </tspan>
                  ))
                : bar.title}
            </text>

            {/* Budget label — top projects only */}
            <text
              className="deck-bar-budget"
              data-target-x={bar.budgetX != null ? bar.budgetX - bar.x : 0}
              data-target-y={bar.height / 2}
              data-target-font-size={bar.budgetFontSize ?? bar.tagFontSize}
              data-target-opacity={bar.budgetText ? 1 : 0}
              textAnchor={bar.budgetAnchor ?? 'start'}
              dominantBaseline="central"
              fontFamily={FONT_DISPLAY}
              fill={COLOR_MUTED}
              letterSpacing="0.01em"
              style={{ pointerEvents: 'none' }}
            >
              {bar.budgetText ?? ''}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
