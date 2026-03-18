/**
 * TimelineSlideshow — wraps TimelineWorkspace with multiple "slides"
 * (focus domains) controlled by ArrowRight/ArrowLeft.
 *
 * Replaces separate Astro pages (timeline, focus-1, focus-2, focus-3)
 * with a single React component. No page reload, no remount, instant transitions.
 */

import { useCallback, useEffect, useState } from 'react';
import TimelineWorkspace from './TimelineWorkspace';
import type { TimelineDisplayOptions } from './TimelineWorkspace';

interface Slide {
  focusDomain?: [string, string];
  highlightedIds?: string[];
  displayOptions?: TimelineDisplayOptions;
}

const SLIDES: Slide[] = [
  // Slide 0: full timeline (no focus)
  {},
  // Slide 1: focus-1
  {
    focusDomain: ['2021-07-20', '2021-10-01'],
    highlightedIds: [
      'evia-2021-press-conference',
      'evia-2021-announcement-meetings-events-demonstrations-by-civil-society',
      'evia-2021-announcement-meeting-event-by-local-municipalities',
    ],
  },
  // Slide 2: focus-2
  {
    focusDomain: ['2021-07-29', '2022-01-01'],
  },
  // Slide 3: focus-3
  {
    focusDomain: ['2021-07-20', '2023-10-02'],
  },
];

interface TimelineSlideshowProps {
  initialSlide?: number;
  /** Override the slide's focusDomain (used for standalone pages like focus-5) */
  overrideDomain?: [string, string];
}

export default function TimelineSlideshow({ initialSlide = 0, overrideDomain }: TimelineSlideshowProps) {
  const [slideIndex, setSlideIndex] = useState(initialSlide);

  // When overrideDomain is set, this is a standalone page — don't handle nav internally
  const isStandalone = !!overrideDomain;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isStandalone) return; // let BaseLayout global nav handle it

      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.target as HTMLElement).closest('.timeline-host')) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (slideIndex >= SLIDES.length - 1) {
          window.location.href = '/presentation/reconstruction';
        } else {
          setSlideIndex(slideIndex + 1);
        }
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (slideIndex <= 0) {
          window.location.href = '/alerts';
        } else {
          setSlideIndex(slideIndex - 1);
        }
      }
    },
    [slideIndex, isStandalone]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Update URL to reflect current slide (without page reload)
  useEffect(() => {
    if (isStandalone) return;
    const paths = ['/timeline', '/timeline/focus-1', '/timeline/focus-2', '/timeline/focus-3'];
    const path = paths[slideIndex] ?? '/timeline';
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  }, [slideIndex, isStandalone]);

  const slide = SLIDES[slideIndex];

  return (
    <TimelineWorkspace
      focusDomain={overrideDomain ?? slide.focusDomain}
      highlightedIds={slide.highlightedIds}
      displayOptions={slide.displayOptions}
    />
  );
}
