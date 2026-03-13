import {
  scaleTime,
  timeDay,
  timeFormat,
  timeMonth,
  timeWeek,
  timeYear,
  type ScaleTime,
  type CountableTimeInterval,
  type TimeInterval
} from 'd3';
import type { TimelineTickSpec } from './types';

type TickMode = {
  major: TimeInterval;
  minor: TimeInterval;
  format: (date: Date) => string;
};

const formatYear = timeFormat('%Y');
const formatMonthYear = timeFormat('%b %Y');
const formatDayMonth = timeFormat('%d %b');

function everyOrFallback(interval: CountableTimeInterval, step: number): TimeInterval {
  return interval.every(step) ?? interval;
}

function getTickMode(spanMs: number): TickMode {
  const spanYears = spanMs / (365.25 * 24 * 60 * 60 * 1000);

  if (spanYears > 90) {
    return {
      major: everyOrFallback(timeYear, 10),
      minor: everyOrFallback(timeYear, 5),
      format: formatYear
    };
  }

  if (spanYears > 35) {
    return {
      major: everyOrFallback(timeYear, 5),
      minor: everyOrFallback(timeYear, 1),
      format: formatYear
    };
  }

  if (spanYears > 8) {
    return {
      major: everyOrFallback(timeYear, 1),
      minor: everyOrFallback(timeMonth, 6),
      format: formatYear
    };
  }

  if (spanYears > 2) {
    return {
      major: everyOrFallback(timeMonth, 3),
      minor: everyOrFallback(timeMonth, 1),
      format: formatMonthYear
    };
  }

  if (spanYears > 0.5) {
    return {
      major: everyOrFallback(timeMonth, 1),
      minor: everyOrFallback(timeWeek, 1),
      format: formatMonthYear
    };
  }

  if (spanYears > 0.15) {
    return {
      major: everyOrFallback(timeWeek, 1),
      minor: everyOrFallback(timeDay, 1),
      format: formatDayMonth
    };
  }

  // ~15–55 days visible: label only the 1st of each month, minor grid on weeks.
  if (spanYears > 0.04) {
    return {
      major: timeMonth,
      minor: everyOrFallback(timeWeek, 1),
      format: formatMonthYear
    };
  }

  // < ~15 days visible: weekly labels, daily minor grid.
  return {
    major: everyOrFallback(timeWeek, 1),
    minor: everyOrFallback(timeDay, 1),
    format: formatDayMonth
  };
}

export function buildTickSpec(scale: ScaleTime<number, number>): TimelineTickSpec {
  const [domainStart, domainEnd] = scale.domain();
  const spanMs = Math.max(1, domainEnd.getTime() - domainStart.getTime());
  const mode = getTickMode(spanMs);

  return {
    majorTicks: scale.ticks(mode.major),
    minorTicks: scale.ticks(mode.minor),
    formatMajor: mode.format
  };
}

export function createBaseTimeScale(domain: [Date, Date], range: [number, number]): ScaleTime<number, number> {
  return scaleTime().domain(domain).range(range);
}

