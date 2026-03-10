import { easeCubicOut, select } from 'd3';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/utils/usePrefersReducedMotion';
import type { EvoiaMetaProject } from '@/lib/evoia-meta/schema';
import { computeSlideLayout } from '@/lib/evoia-meta/presentation-layout';
import {
  TRANSITION_MS,
  FONT_DISPLAY,
  FONT_BODY,
  COLOR_TEXT,
  COLOR_CATEGORY_LABEL
} from '@/lib/evoia-meta/presentation-constants';

type AnnouncedProjectsDeckProps = {
  projects: EvoiaMetaProject[];
};

const TOTAL_SLIDES = 2;

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

export default function AnnouncedProjectsDeck({ projects }: AnnouncedProjectsDeckProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const barsRef = useRef<SVGGElement>(null);
  const isFirstRenderRef = useRef(true);
  const [slideIndex, setSlideIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const viewport = useViewportSize();

  const layout = useMemo(
    () => computeSlideLayout(projects, viewport.width, viewport.height, slideIndex),
    [projects, viewport.width, viewport.height, slideIndex]
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
  // useLayoutEffect ensures first-render positions are set before browser paint.
  // On first render: duration=0 (instant placement, no flash).
  // On subsequent renders: D3 transitions animate from old to new positions.
  // React only updates data-target-* attributes; D3 manages the actual
  // transform, width, height, fill, y, and font-size attributes.
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
        return Number((this as HTMLElement).dataset.targetFontSize) || 10;
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
  }, [layout, transitionMs]);

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

      {/* Category labels (rotated 90° CW) */}
      {layout.categoryLabels.map((catLabel) => (
        <text
          key={catLabel.category}
          x={0}
          y={0}
          transform={`translate(${catLabel.x}, ${catLabel.y}) rotate(90)`}
          fontFamily={FONT_DISPLAY}
          fontSize={catLabel.fontSize}
          fill={COLOR_CATEGORY_LABEL}
          textAnchor="middle"
          dominantBaseline="central"
          letterSpacing="0.004em"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {catLabel.label}
        </text>
      ))}

      {/* Parent group headers */}
      {layout.groupHeaders.map((header) => (
        <text
          key={header.key}
          x={header.x}
          y={header.y + header.height / 2}
          dominantBaseline="central"
          fontFamily={FONT_BODY}
          fontSize={header.fontSize}
          fontWeight={700}
          fill={COLOR_TEXT}
          style={{ pointerEvents: 'none' }}
        >
          {header.text}
        </text>
      ))}

      {/* Project bars — positions/sizes managed entirely by D3 transitions.
          React only updates data-target-* attributes; D3 reads them and
          animates the actual transform, width, height, fill, etc. */}
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
              data-target-y={bar.height / 2}
              data-target-font-size={bar.titleFontSize}
              data-target-opacity={bar.titleVisible ? 1 : 0}
              dominantBaseline="central"
              fontFamily={FONT_BODY}
              fill={COLOR_TEXT}
              style={{ pointerEvents: 'none' }}
            >
              {bar.title}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
