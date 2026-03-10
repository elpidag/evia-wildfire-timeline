import {
  evoiaMetaProjectSchema,
  type EvoiaMetaBaseProject,
  type EvoiaMetaProject,
  type FundingProvenance,
  type IndicativeEndPrecision,
  type TimelineStatus
} from './schema';

type DeriveResult = {
  projects: EvoiaMetaProject[];
  warnings: string[];
};

type DerivedIndicativeEnd = {
  indicativeEndDateISO: string | null;
  indicativeEndPrecision: IndicativeEndPrecision;
  hasUsableEndDate: boolean;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_YEAR_PATTERN = /^(\d{1,2})\/(\d{4})$/;
const ISO_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const MONTH_YEAR_RANGE_PATTERN = /^(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{4})$/;
const YEAR_RANGE_PATTERN = /^(\d{4})\s*[-–]\s*(\d{4})$/;
const SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const RELATIVE_PATTERN = /(month|months|year|years|no exact date|ongoing|tbd|until|from the moment)/i;
const MISSING_END_DATE_VALUES = new Set(['not defined', 'not available', '-', 'n/a', 'na']);

export const MEGA_PROJECT_THRESHOLD = 20_000_000;

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeYear(yearString: string): number | null {
  const year = Number(yearString);
  if (!Number.isInteger(year)) {
    return null;
  }

  if (yearString.length === 2) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }

  return year;
}

function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    return 0;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function toEndOfMonthIso(year: number, month: number): string {
  return toIsoDate(year, month, daysInMonth(year, month));
}

function parseMonthYear(monthString: string, yearString: string): { month: number; year: number } | null {
  const month = Number(monthString);
  const year = normalizeYear(yearString);
  if (year == null) {
    return null;
  }
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) {
    return null;
  }

  return { month, year };
}

type SlashDateCandidate = {
  year: number;
  month: number;
  day: number;
  clampedFrom: number | null;
};

function resolveSlashDateCandidate(day: number, month: number, year: number): SlashDateCandidate | null {
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || month < 1 || month > 12) {
    return null;
  }

  const maxDay = daysInMonth(year, month);
  if (maxDay === 0) {
    return null;
  }

  if (day > maxDay) {
    return {
      year,
      month,
      day: maxDay,
      clampedFrom: day
    };
  }

  return {
    year,
    month,
    day,
    clampedFrom: null
  };
}

function parseSlashDate(rawValue: string, rowNumber: number, warnings: string[]): string | null {
  const match = rawValue.match(SLASH_DATE_PATTERN);
  if (!match) {
    return null;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = normalizeYear(match[3]);
  if (year == null || !Number.isInteger(first) || !Number.isInteger(second)) {
    warnings.push(`Row ${rowNumber}: invalid slash date "${rawValue}".`);
    return null;
  }

  const dayMonthCandidate = resolveSlashDateCandidate(first, second, year);
  const monthDayCandidate = resolveSlashDateCandidate(second, first, year);

  let chosen: SlashDateCandidate | null = null;
  if (dayMonthCandidate && !monthDayCandidate) {
    chosen = dayMonthCandidate;
  } else if (!dayMonthCandidate && monthDayCandidate) {
    chosen = monthDayCandidate;
  } else if (dayMonthCandidate && monthDayCandidate) {
    if (first > 12) {
      chosen = dayMonthCandidate;
    } else if (second > 12) {
      chosen = monthDayCandidate;
    } else {
      // Default to day/month for ambiguous dates to match workbook conventions.
      chosen = dayMonthCandidate;
    }
  }

  if (!chosen) {
    warnings.push(`Row ${rowNumber}: invalid slash date "${rawValue}".`);
    return null;
  }

  if (chosen.clampedFrom != null) {
    warnings.push(
      `Row ${rowNumber}: clamped invalid day in "${rawValue}" from ${chosen.clampedFrom} to ${chosen.day}.`
    );
  }

  return toIsoDate(chosen.year, chosen.month, chosen.day);
}

function parseIsoDate(rawValue: string, rowNumber: number, warnings: string[]): string | null {
  if (!ISO_DATE_PATTERN.test(rawValue)) {
    return null;
  }

  const [yearString, monthString, dayString] = rawValue.split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  const candidate = resolveSlashDateCandidate(day, month, year);
  if (!candidate) {
    warnings.push(`Row ${rowNumber}: invalid ISO date value "${rawValue}".`);
    return null;
  }

  if (candidate.clampedFrom != null) {
    warnings.push(
      `Row ${rowNumber}: clamped invalid day in "${rawValue}" from ${candidate.clampedFrom} to ${candidate.day}.`
    );
  }

  return toIsoDate(candidate.year, candidate.month, candidate.day);
}

export function deriveFundingProvenance(fundedByRaw: string | null): FundingProvenance {
  if (!fundedByRaw) {
    return 'mixed_unclear';
  }

  const normalized = normalizeText(fundedByRaw);

  if (normalized === 'not defined' || normalized === 'other') {
    return 'mixed_unclear';
  }

  if (normalized === 'donations' || normalized === 'diazoma') {
    return 'private_philanthropy';
  }

  return 'public';
}

export function deriveSourceTable(tag: string, rowNumber: number): 'A' | 'B' | 'AB' {
  const normalizedTag = tag.trim().toUpperCase();
  if (normalizedTag.startsWith('AB')) {
    return 'AB';
  }
  if (normalizedTag.startsWith('A')) {
    return 'A';
  }
  if (normalizedTag.startsWith('B')) {
    return 'B';
  }

  throw new Error(`Row ${rowNumber}: unable to derive sourceTable from tag "${tag}".`);
}

export function deriveIndicativeEnd(
  rawValue: string | null,
  rowNumber: number,
  warnings: string[]
): DerivedIndicativeEnd {
  if (!rawValue) {
    return {
      indicativeEndDateISO: null,
      indicativeEndPrecision: 'unknown',
      hasUsableEndDate: false
    };
  }

  const value = rawValue.trim();
  if (value.length === 0) {
    return {
      indicativeEndDateISO: null,
      indicativeEndPrecision: 'unknown',
      hasUsableEndDate: false
    };
  }

  if (MISSING_END_DATE_VALUES.has(normalizeText(value))) {
    return {
      indicativeEndDateISO: null,
      indicativeEndPrecision: 'unknown',
      hasUsableEndDate: false
    };
  }

  if (ISO_DATE_PATTERN.test(value)) {
    const isoDate = parseIsoDate(value, rowNumber, warnings);
    if (!isoDate) {
      return {
        indicativeEndDateISO: null,
        indicativeEndPrecision: 'unknown',
        hasUsableEndDate: false
      };
    }

    return {
      indicativeEndDateISO: isoDate,
      indicativeEndPrecision: 'month',
      hasUsableEndDate: true
    };
  }

  if (YEAR_PATTERN.test(value)) {
    return {
      indicativeEndDateISO: `${value}-12-31`,
      indicativeEndPrecision: 'year',
      hasUsableEndDate: true
    };
  }

  const monthYearRangeMatch = value.match(MONTH_YEAR_RANGE_PATTERN);
  if (monthYearRangeMatch) {
    const end = parseMonthYear(monthYearRangeMatch[3], monthYearRangeMatch[4]);
    if (!end) {
      warnings.push(`Row ${rowNumber}: invalid month/year range "${value}".`);
      return {
        indicativeEndDateISO: null,
        indicativeEndPrecision: 'unknown',
        hasUsableEndDate: false
      };
    }

    return {
      indicativeEndDateISO: toEndOfMonthIso(end.year, end.month),
      indicativeEndPrecision: 'range',
      hasUsableEndDate: true
    };
  }

  const yearRangeMatch = value.match(YEAR_RANGE_PATTERN);
  if (yearRangeMatch) {
    const startYear = Number(yearRangeMatch[1]);
    const endYear = Number(yearRangeMatch[2]);
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) {
      warnings.push(`Row ${rowNumber}: invalid year range "${value}".`);
      return {
        indicativeEndDateISO: null,
        indicativeEndPrecision: 'unknown',
        hasUsableEndDate: false
      };
    }

    return {
      indicativeEndDateISO: `${String(endYear).padStart(4, '0')}-12-31`,
      indicativeEndPrecision: 'range',
      hasUsableEndDate: true
    };
  }

  const slashDate = parseSlashDate(value, rowNumber, warnings);
  if (slashDate) {
    return {
      indicativeEndDateISO: slashDate,
      indicativeEndPrecision: 'month',
      hasUsableEndDate: true
    };
  }

  const monthYearMatch = value.match(MONTH_YEAR_PATTERN);
  if (monthYearMatch) {
    const parsed = parseMonthYear(monthYearMatch[1], monthYearMatch[2]);
    if (!parsed) {
      warnings.push(`Row ${rowNumber}: invalid month/year value "${value}".`);
      return {
        indicativeEndDateISO: null,
        indicativeEndPrecision: 'unknown',
        hasUsableEndDate: false
      };
    }

    return {
      indicativeEndDateISO: toEndOfMonthIso(parsed.year, parsed.month),
      indicativeEndPrecision: 'month',
      hasUsableEndDate: true
    };
  }

  const isoMonthMatch = value.match(ISO_MONTH_PATTERN);
  if (isoMonthMatch) {
    const parsed = parseMonthYear(isoMonthMatch[2], isoMonthMatch[1]);
    if (!parsed) {
      warnings.push(`Row ${rowNumber}: invalid ISO month value "${value}".`);
      return {
        indicativeEndDateISO: null,
        indicativeEndPrecision: 'unknown',
        hasUsableEndDate: false
      };
    }

    return {
      indicativeEndDateISO: toEndOfMonthIso(parsed.year, parsed.month),
      indicativeEndPrecision: 'month',
      hasUsableEndDate: true
    };
  }

  if (RELATIVE_PATTERN.test(value) || /[a-z]/i.test(value)) {
    return {
      indicativeEndDateISO: null,
      indicativeEndPrecision: 'relative',
      hasUsableEndDate: false
    };
  }

  warnings.push(`Row ${rowNumber}: unrecognized timeframe "${value}" treated as unknown.`);
  return {
    indicativeEndDateISO: null,
    indicativeEndPrecision: 'unknown',
    hasUsableEndDate: false
  };
}

export function deriveTimelineStatus(
  completed: boolean,
  hasUsableEndDate: boolean,
  indicativeEndDateISO: string | null,
  todayISO: string
): TimelineStatus {
  if (completed) {
    return 'completed';
  }

  if (!hasUsableEndDate || !indicativeEndDateISO) {
    return 'undated';
  }

  return indicativeEndDateISO < todayISO ? 'past_due_unfinished' : 'ongoing';
}

export function deriveProject(baseProject: EvoiaMetaBaseProject, todayISO: string, warnings: string[]): EvoiaMetaProject {
  const timeframeFromIndicative = deriveIndicativeEnd(baseProject.indicativeCompletionRaw, baseProject.rowNumber, warnings);
  const timeframeFromEndDate =
    baseProject.endDateRaw != null ? deriveIndicativeEnd(baseProject.endDateRaw, baseProject.rowNumber, warnings) : null;

  let timeframe = timeframeFromIndicative;
  if (!timeframe.hasUsableEndDate && timeframeFromEndDate?.hasUsableEndDate) {
    timeframe = timeframeFromEndDate;
  }

  if (
    timeframeFromIndicative.hasUsableEndDate &&
    timeframeFromEndDate?.hasUsableEndDate &&
    timeframeFromIndicative.indicativeEndDateISO !== timeframeFromEndDate.indicativeEndDateISO
  ) {
    warnings.push(
      `Row ${baseProject.rowNumber}: indicative completion "${baseProject.indicativeCompletionRaw}" and end date "${baseProject.endDateRaw}" resolve to different dates (${timeframeFromIndicative.indicativeEndDateISO} vs ${timeframeFromEndDate.indicativeEndDateISO}). Using indicative completion.`
    );
  }

  const fundingProvenance = deriveFundingProvenance(baseProject.fundedByRaw);
  const sourceTable = deriveSourceTable(baseProject.tag, baseProject.rowNumber);

  const timelineStatus = deriveTimelineStatus(
    baseProject.completed,
    timeframe.hasUsableEndDate,
    timeframe.indicativeEndDateISO,
    todayISO
  );

  const isMegaProject = (baseProject.announcedBudget ?? 0) >= MEGA_PROJECT_THRESHOLD;

  return evoiaMetaProjectSchema.parse({
    ...baseProject,
    fundingProvenance,
    indicativeEndDateISO: timeframe.indicativeEndDateISO,
    indicativeEndPrecision: timeframe.indicativeEndPrecision,
    hasUsableEndDate: timeframe.hasUsableEndDate,
    sourceTable,
    timelineStatus,
    isMegaProject
  });
}

export function deriveProjects(baseProjects: EvoiaMetaBaseProject[], todayISO: string): DeriveResult {
  const warnings: string[] = [];
  const projects = baseProjects.map((project) => deriveProject(project, todayISO, warnings));

  return {
    projects,
    warnings
  };
}
