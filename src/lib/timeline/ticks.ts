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
  filterMajor?: (date: Date) => boolean;
  /** When set, replaces minor ticks with only the 15th of each month */
  minor15thOnly?: boolean;
  /** When set, generates minor ticks at 1st and 15th of each month */
  minorFirstAnd15th?: boolean;
  /** When set, emits no minor ticks at all */
  noMinor?: boolean;
  /** When set, adds daily dotted tick lines */
  withDailyTicks?: boolean;
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

  // Fully zoomed out (~3–8 years): Jan (thick line + year) + Jul (thin line + label)
  if (spanYears > 2.5) {
    return {
      major: timeMonth,
      minor: timeMonth,
      format: (d: Date) => d.getMonth() === 0 ? formatYear(d) : 'Jul',
      filterMajor: (d: Date) => d.getMonth() === 0 || d.getMonth() === 6,
      noMinor: true,
    };
  }

  // ~24 months view: Jan (thick + year) + Apr, Jul, Oct (thin lines + labels)
  if (spanYears > 1.2) {
    const formatMonth = timeFormat('%b');
    return {
      major: timeMonth,
      minor: timeMonth,
      format: (d: Date) => d.getMonth() === 0 ? formatYear(d) : formatMonth(d),
      filterMajor: (d: Date) => d.getMonth() % 3 === 0,
      noMinor: true,
    };
  }

  // ~6 months to 3 months (max zoom): all months + 1st/15th + daily dotted lines
  if (spanYears <= 0.5) {
    const formatMonth = timeFormat('%b');
    return {
      major: timeMonth,
      minor: timeMonth,
      format: (d: Date) => d.getMonth() === 0 ? formatYear(d) : formatMonth(d),
      minorFirstAnd15th: true,
      withDailyTicks: true,
    };
  }

  // 18 months to 6 months: all months labeled + 1st and 15th grid lines
  {
    const formatMonth = timeFormat('%b');
    return {
      major: timeMonth,
      minor: timeMonth,
      format: (d: Date) => d.getMonth() === 0 ? formatYear(d) : formatMonth(d),
      minorFirstAnd15th: true,
    };
  }
}

export function buildTickSpec(scale: ScaleTime<number, number>): TimelineTickSpec {
  const [domainStart, domainEnd] = scale.domain();
  const spanMs = Math.max(1, domainEnd.getTime() - domainStart.getTime());
  const mode = getTickMode(spanMs);

  const majorTicks = scale.ticks(mode.major);

  let minorTicks: Date[] = [];
  if (mode.noMinor) {
    // No minor ticks at this zoom level
  } else if (mode.minorFirstAnd15th) {
    const firsts = scale.ticks(mode.minor);
    const fifteenths = firsts.map((d) => new Date(d.getFullYear(), d.getMonth(), 15));
    minorTicks = [...firsts, ...fifteenths].sort((a, b) => a.getTime() - b.getTime());
  } else if (mode.minor15thOnly) {
    minorTicks = scale.ticks(mode.minor).map(
      (d) => new Date(d.getFullYear(), d.getMonth(), 15)
    );
  } else {
    minorTicks = scale.ticks(mode.minor);
  }

  // Daily ticks: all days except 1st and 15th (those are already minor ticks)
  let dailyTicks: Date[] = [];
  if (mode.withDailyTicks) {
    dailyTicks = scale.ticks(timeDay).filter(
      (d) => d.getDate() !== 1 && d.getDate() !== 15
    );
  }

  return {
    majorTicks: mode.filterMajor ? majorTicks.filter(mode.filterMajor) : majorTicks,
    minorTicks,
    dailyTicks,
    formatMajor: mode.format
  };
}

export function createBaseTimeScale(domain: [Date, Date], range: [number, number]): ScaleTime<number, number> {
  return scaleTime().domain(domain).range(range);
}

