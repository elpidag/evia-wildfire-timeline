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
const RANGE_PATTERN = /^(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{4})$/;
const RELATIVE_PATTERN = /(month|months|year|years|no exact date|ongoing|tbd|unknown)/i;

const PUBLIC_FUNDER_VALUES = [
  'Regional Program of Sterea Ellada 2021-2027',
  'National Development Program 2021-2025',
  'Recovery & Resilience Plan',
  'Green Fund',
  'Regional Development Program 2021-2025',
  'Regional Operational Program of Sterea Ellada 2014-2020 (ΠΕΠ 2014-2020)',
  'Competitiveness Programme 2021-2027',
  'National Employment Service (Δ.ΥΠ.Α)',
  'National Infrastructure Development Program',
  'Sectoral Development Program of the Ministry of Education 2021-2025',
  'Rural Development Programme',
  'Good Governance - Institutions and Transparency / EEA Grants 2014–2021',
  'OFYPEKA',
  'PEKA (former YMEPERAA)'
] as const;

const PUBLIC_FUNDER_SET = new Set(PUBLIC_FUNDER_VALUES.map((value) => normalizeText(value)));

export const MEGA_PROJECT_THRESHOLD = 20_000_000;

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toEndOfMonthIso(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function parseMonthYear(monthString: string, yearString: string): { month: number; year: number } | null {
  const month = Number(monthString);
  const year = Number(yearString);
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) {
    return null;
  }

  return { month, year };
}

export function deriveFundingProvenance(fundedByRaw: string | null): FundingProvenance {
  if (!fundedByRaw) {
    return 'mixed_unclear';
  }

  const normalized = normalizeText(fundedByRaw);
  if (normalized === normalizeText('Donations')) {
    return 'private_philanthropy';
  }
  if (normalized === normalizeText('Other')) {
    return 'mixed_unclear';
  }
  if (PUBLIC_FUNDER_SET.has(normalized)) {
    return 'public';
  }
  return 'mixed_unclear';
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

  if (ISO_DATE_PATTERN.test(value)) {
    return {
      indicativeEndDateISO: value,
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

  const rangeMatch = value.match(RANGE_PATTERN);
  if (rangeMatch) {
    const end = parseMonthYear(rangeMatch[3], rangeMatch[4]);
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
  const timeframe = deriveIndicativeEnd(baseProject.indicativeCompletionRaw, baseProject.rowNumber, warnings);
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
