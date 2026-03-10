import { easeCubicOut, select } from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const TOTAL_SLIDES = 1; // Only slide 1 for now

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
  useEffect(() => {
    if (!barsRef.current) {
      return;
    }

    const g = select(barsRef.current);

    g.selectAll<SVGGElement, unknown>('g.deck-bar')
      .transition()
      .duration(transitionMs)
      .ease(easeCubicOut)
      .attr('transform', function () {
        const x = Number((this as HTMLElement).dataset.targetX) || 0;
        const y = Number((this as HTMLElement).dataset.targetY) || 0;
        return `translate(${x}, ${y})`;
      });

    g.selectAll<SVGRectElement, unknown>('rect.deck-bar-rect')
      .transition()
      .duration(transitionMs)
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
        textAnchor="end"
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

      {/* Project bars */}
      <g ref={barsRef}>
        {layout.bars.map((bar) => (
          <g
            key={bar.id}
            className="deck-bar"
            data-target-x={bar.x}
            data-target-y={bar.y}
            transform={`translate(${bar.x}, ${bar.y})`}
          >
            {/* Bar rectangle */}
            <rect
              className="deck-bar-rect"
              x={0}
              y={0}
              width={bar.width}
              height={bar.height}
              fill={bar.fill}
              data-target-width={bar.width}
              data-target-height={bar.height}
              data-target-fill={bar.fill}
            />

            {/* Tag label (left of bar) */}
            <text
              x={bar.tagX - bar.x}
              y={bar.height / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontFamily={FONT_DISPLAY}
              fontSize={bar.tagFontSize}
              fontWeight={600}
              fill={COLOR_TEXT}
              letterSpacing="0.01em"
            >
              {bar.displayTag}
            </text>

            {/* Title text (inside bar) */}
            {bar.titleVisible && (
              <text
                x={bar.titleX - bar.x}
                y={bar.height / 2}
                dominantBaseline="central"
                fontFamily={FONT_BODY}
                fontSize={bar.titleFontSize}
                fill={COLOR_TEXT}
                style={{ pointerEvents: 'none' }}
              >
                {bar.title}
              </text>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}
