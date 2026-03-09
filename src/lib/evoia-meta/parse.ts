import {
  evoiaMetaBaseProjectSchema,
  type EvoiaMetaBaseProject,
  type EvoiaMetaOverrides,
  type EvoiaMetaProjectOverride
} from './schema';

type ParseResult = {
  projects: EvoiaMetaBaseProject[];
  warnings: string[];
};

const COLUMN_NAMES = {
  tag: 'tag',
  title: 'title',
  subtitle: 'subtitle',
  category: 'category',
  fundedBy: 'funded by',
  approved: 'approved',
  includedInProgramme: 'included in a programme',
  openToAssignment: 'open to assignment',
  assigned: 'assigned',
  completion: 'completion',
  responsibleAgency: 'responsible agency',
  privateActorInvolved: 'private actor involved',
  announcedBudget: 'announced budget',
  indicativeCompletion: 'indicative completion timeframe',
  budgetDifferentThanAnnounced: 'budget different than announced',
  furtheredTimeframe: 'furthered timeframe',
  description: 'description',
  locationArea: 'location-area of implementation',
  comments: 'comments'
} as const;

const TRUE_VALUES = new Set(['yes', 'true', '1']);
const FALSE_VALUES = new Set(['no', 'false', '0', '']);

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = normalizeHeader(rawKey);
    if (key.length === 0 || key.startsWith('__empty')) {
      continue;
    }
    normalized[key] = rawValue;
  }

  return normalized;
}

function getCell(row: Record<string, unknown>, columnName: string): unknown {
  return row[columnName];
}

function toNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  const fallback = String(value).trim();
  return fallback.length > 0 ? fallback : null;
}

function toNullableRawValue(value: unknown): string | number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  const fallback = String(value).trim();
  return fallback.length > 0 ? fallback : null;
}

function toRequiredString(value: unknown, fieldName: string, rowNumber: number): string {
  const normalized = toNullableString(value);
  if (!normalized) {
    throw new Error(`Row ${rowNumber}: missing required field "${fieldName}".`);
  }
  return normalized;
}

function parseBoolean(value: unknown, fieldName: string, rowNumber: number): boolean {
  const normalized = (toNullableString(value) ?? '').toLowerCase();

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`Row ${rowNumber}: unsupported boolean value "${String(value)}" for "${fieldName}".`);
}

function parseBudget(rawValue: unknown, rowNumber: number, warnings: string[]): { announcedBudgetRaw: string | number | null; announcedBudget: number | null } {
  const announcedBudgetRaw = toNullableRawValue(rawValue);
  if (announcedBudgetRaw == null) {
    return {
      announcedBudgetRaw: null,
      announcedBudget: null
    };
  }

  if (typeof announcedBudgetRaw === 'number') {
    return {
      announcedBudgetRaw,
      announcedBudget: announcedBudgetRaw
    };
  }

  const normalized = announcedBudgetRaw.replace(/€/g, '').replace(/,/g, '').replace(/\s+/g, '');
  if (normalized.length === 0) {
    return {
      announcedBudgetRaw,
      announcedBudget: null
    };
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    warnings.push(`Row ${rowNumber}: could not parse announced budget "${announcedBudgetRaw}".`);
    return {
      announcedBudgetRaw,
      announcedBudget: null
    };
  }

  return {
    announcedBudgetRaw,
    announcedBudget: parsed
  };
}

function createProjectId(tag: string): string {
  const slug = tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  if (slug.length === 0) {
    throw new Error(`Cannot build project id from empty tag "${tag}".`);
  }

  return `evoia-meta-${slug}`;
}

export function deriveDisplayTitle(titleRaw: string | null, subtitleRaw: string | null, tag: string): string {
  return titleRaw ?? subtitleRaw ?? tag;
}

export function parseWorkbookRows(rawRows: Array<Record<string, unknown>>): ParseResult {
  const projects: EvoiaMetaBaseProject[] = [];
  const warnings: string[] = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 1;
    const row = normalizeRow(rawRow);

    const tag = toRequiredString(getCell(row, COLUMN_NAMES.tag), 'tag', rowNumber);
    const titleRaw = toNullableString(getCell(row, COLUMN_NAMES.title));
    const subtitleRaw = toNullableString(getCell(row, COLUMN_NAMES.subtitle));

    const { announcedBudgetRaw, announcedBudget } = parseBudget(getCell(row, COLUMN_NAMES.announcedBudget), rowNumber, warnings);

    const project: EvoiaMetaBaseProject = {
      id: createProjectId(tag),
      rowNumber,

      tag,
      titleRaw,
      subtitleRaw,
      displayTitle: deriveDisplayTitle(titleRaw, subtitleRaw, tag),

      category: toRequiredString(getCell(row, COLUMN_NAMES.category), 'category', rowNumber),
      fundedByRaw: toNullableString(getCell(row, COLUMN_NAMES.fundedBy)),

      approved: parseBoolean(getCell(row, COLUMN_NAMES.approved), 'approved', rowNumber),
      includedInProgramme: parseBoolean(getCell(row, COLUMN_NAMES.includedInProgramme), 'included in a programme', rowNumber),
      openToAssignment: parseBoolean(getCell(row, COLUMN_NAMES.openToAssignment), 'open to assignment', rowNumber),
      assigned: parseBoolean(getCell(row, COLUMN_NAMES.assigned), 'assigned', rowNumber),
      completed: parseBoolean(getCell(row, COLUMN_NAMES.completion), 'completion', rowNumber),

      announcedBudgetRaw,
      announcedBudget,

      indicativeCompletionRaw: toNullableString(getCell(row, COLUMN_NAMES.indicativeCompletion)),
      furtheredTimeframeRaw: toNullableString(getCell(row, COLUMN_NAMES.furtheredTimeframe)),
      budgetDifferentThanAnnouncedRaw: toNullableRawValue(getCell(row, COLUMN_NAMES.budgetDifferentThanAnnounced)),

      responsibleAgency: toNullableString(getCell(row, COLUMN_NAMES.responsibleAgency)),
      privateActorInvolved: toNullableString(getCell(row, COLUMN_NAMES.privateActorInvolved)),
      description: toNullableString(getCell(row, COLUMN_NAMES.description)),
      locationArea: toNullableString(getCell(row, COLUMN_NAMES.locationArea)),
      comments: toNullableString(getCell(row, COLUMN_NAMES.comments))
    };

    projects.push(evoiaMetaBaseProjectSchema.parse(project));
  });

  return {
    projects,
    warnings
  };
}

function resolveOverrideProjectId(overrideKey: string, idSet: Set<string>, tagToIdMap: Map<string, string>): string | null {
  if (idSet.has(overrideKey)) {
    return overrideKey;
  }

  const byTag = tagToIdMap.get(overrideKey.toUpperCase());
  return byTag ?? null;
}

function applyProjectOverride(project: EvoiaMetaBaseProject, override: EvoiaMetaProjectOverride): EvoiaMetaBaseProject {
  const next: EvoiaMetaBaseProject = { ...project };

  if (override.titleRaw !== undefined) {
    next.titleRaw = override.titleRaw;
  }
  if (override.subtitleRaw !== undefined) {
    next.subtitleRaw = override.subtitleRaw;
  }
  if (override.category !== undefined) {
    next.category = override.category;
  }
  if (override.fundedByRaw !== undefined) {
    next.fundedByRaw = override.fundedByRaw;
  }
  if (override.approved !== undefined) {
    next.approved = override.approved;
  }
  if (override.includedInProgramme !== undefined) {
    next.includedInProgramme = override.includedInProgramme;
  }
  if (override.openToAssignment !== undefined) {
    next.openToAssignment = override.openToAssignment;
  }
  if (override.assigned !== undefined) {
    next.assigned = override.assigned;
  }
  if (override.completed !== undefined) {
    next.completed = override.completed;
  }
  if (override.announcedBudgetRaw !== undefined) {
    next.announcedBudgetRaw = override.announcedBudgetRaw;
    if (override.announcedBudgetRaw == null) {
      next.announcedBudget = null;
    } else if (typeof override.announcedBudgetRaw === 'number') {
      next.announcedBudget = override.announcedBudgetRaw;
    } else {
      const normalized = override.announcedBudgetRaw.replace(/€/g, '').replace(/,/g, '').replace(/\s+/g, '');
      const parsed = normalized.length > 0 ? Number(normalized) : Number.NaN;
      next.announcedBudget = Number.isFinite(parsed) ? parsed : null;
    }
  }
  if (override.indicativeCompletionRaw !== undefined) {
    next.indicativeCompletionRaw = override.indicativeCompletionRaw;
  }
  if (override.furtheredTimeframeRaw !== undefined) {
    next.furtheredTimeframeRaw = override.furtheredTimeframeRaw;
  }
  if (override.budgetDifferentThanAnnouncedRaw !== undefined) {
    next.budgetDifferentThanAnnouncedRaw = override.budgetDifferentThanAnnouncedRaw;
  }
  if (override.responsibleAgency !== undefined) {
    next.responsibleAgency = override.responsibleAgency;
  }
  if (override.privateActorInvolved !== undefined) {
    next.privateActorInvolved = override.privateActorInvolved;
  }
  if (override.description !== undefined) {
    next.description = override.description;
  }
  if (override.locationArea !== undefined) {
    next.locationArea = override.locationArea;
  }
  if (override.comments !== undefined) {
    next.comments = override.comments;
  }

  if (override.displayTitle !== undefined) {
    next.displayTitle = override.displayTitle;
  } else {
    next.displayTitle = deriveDisplayTitle(next.titleRaw, next.subtitleRaw, next.tag);
  }

  return evoiaMetaBaseProjectSchema.parse(next);
}

export function applyOverrides(projects: EvoiaMetaBaseProject[], overrides: EvoiaMetaOverrides): ParseResult {
  const idSet = new Set(projects.map((project) => project.id));
  const tagToIdMap = new Map(projects.map((project) => [project.tag.toUpperCase(), project.id]));
  const warningMessages: string[] = [];

  const overridesById = new Map<string, EvoiaMetaProjectOverride>();
  for (const [overrideKey, overrideValue] of Object.entries(overrides.projects)) {
    const projectId = resolveOverrideProjectId(overrideKey, idSet, tagToIdMap);
    if (!projectId) {
      warningMessages.push(`Override key "${overrideKey}" did not match any project id or tag.`);
      continue;
    }

    const existing = overridesById.get(projectId);
    overridesById.set(projectId, existing ? { ...existing, ...overrideValue } : overrideValue);
  }

  const patchedProjects = projects.map((project) => {
    const override = overridesById.get(project.id);
    if (!override) {
      return project;
    }
    return applyProjectOverride(project, override);
  });

  return {
    projects: patchedProjects,
    warnings: warningMessages
  };
}
