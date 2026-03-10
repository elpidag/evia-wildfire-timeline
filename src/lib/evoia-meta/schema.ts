import { z } from 'zod';

export const fundingProvenanceValues = ['public', 'private_philanthropy', 'mixed_unclear'] as const;
export const timelineStatusValues = ['completed', 'past_due_unfinished', 'ongoing', 'undated'] as const;
export const indicativeEndPrecisionValues = ['year', 'month', 'range', 'relative', 'unknown'] as const;
export const sourceTableValues = ['A', 'B', 'AB'] as const;

const nullableNonEmptyStringSchema = z.string().trim().min(1).nullable();
const nullableRawValueSchema = z.union([z.string().trim().min(1), z.number()]).nullable();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const fundingProvenanceSchema = z.enum(fundingProvenanceValues);
export const timelineStatusSchema = z.enum(timelineStatusValues);
export const indicativeEndPrecisionSchema = z.enum(indicativeEndPrecisionValues);
export const sourceTableSchema = z.enum(sourceTableValues);

export const evoiaMetaBaseProjectSchema = z.object({
  id: z.string().trim().min(1),
  rowNumber: z.number().int().positive(),

  tag: z.string().trim().min(1),
  titleRaw: nullableNonEmptyStringSchema,
  subtitleRaw: nullableNonEmptyStringSchema,
  displayTitle: z.string().trim().min(1),

  /** Parent group title for subprojects (e.g. "Forest economy", "Reforestation") */
  parentGroupTitle: nullableNonEmptyStringSchema,
  /** True when this project is a subproject within a parent group */
  isSubproject: z.boolean(),

  category: z.string().trim().min(1),
  fundedByRaw: nullableNonEmptyStringSchema,

  approved: z.boolean(),
  includedInProgramme: z.boolean(),
  openToAssignment: z.boolean(),
  assigned: z.boolean(),
  completed: z.boolean(),

  announcedBudgetRaw: nullableRawValueSchema,
  announcedBudget: z.number().nonnegative().nullable(),

  indicativeCompletionRaw: nullableNonEmptyStringSchema,
  startDateRaw: nullableNonEmptyStringSchema,
  endDateRaw: nullableNonEmptyStringSchema,
  exactStartDateRaw: nullableNonEmptyStringSchema,
  exactEndDateRaw: nullableNonEmptyStringSchema,
  durationInMonthsRaw: nullableRawValueSchema,
  lastUpdateRaw: nullableNonEmptyStringSchema,
  furtheredTimeframeRaw: nullableNonEmptyStringSchema,
  budgetDifferentThanAnnouncedRaw: nullableRawValueSchema,

  responsibleAgency: nullableNonEmptyStringSchema,
  privateActorInvolved: nullableNonEmptyStringSchema,
  description: nullableNonEmptyStringSchema,
  locationArea: nullableNonEmptyStringSchema,
  comments: nullableNonEmptyStringSchema
});

export const evoiaMetaProjectSchema = evoiaMetaBaseProjectSchema.extend({
  fundingProvenance: fundingProvenanceSchema,
  indicativeEndDateISO: isoDateSchema.nullable(),
  indicativeEndPrecision: indicativeEndPrecisionSchema,
  hasUsableEndDate: z.boolean(),
  sourceTable: sourceTableSchema,
  timelineStatus: timelineStatusSchema,
  isMegaProject: z.boolean()
});

const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const evoiaMetaSummarySchema = z.object({
  generatedAt: z.string().datetime(),
  todayISO: isoDateSchema,
  totalProjects: nonNegativeIntegerSchema,
  totalBudget: z.number().nonnegative(),
  categories: z.array(
    z.object({
      category: z.string().trim().min(1),
      projectCount: nonNegativeIntegerSchema,
      totalBudget: z.number().nonnegative()
    })
  ),
  fundingProvenanceCounts: z.object({
    public: nonNegativeIntegerSchema,
    private_philanthropy: nonNegativeIntegerSchema,
    mixed_unclear: nonNegativeIntegerSchema
  }),
  timelineStatusCounts: z.object({
    completed: nonNegativeIntegerSchema,
    past_due_unfinished: nonNegativeIntegerSchema,
    ongoing: nonNegativeIntegerSchema,
    undated: nonNegativeIntegerSchema
  }),
  dateExtent: z.object({
    minIndicativeEndDateISO: isoDateSchema.nullable(),
    maxIndicativeEndDateISO: isoDateSchema.nullable(),
    usableEndDateCount: nonNegativeIntegerSchema,
    undatedCount: nonNegativeIntegerSchema
  }),
  megaProjectStats: z.object({
    threshold: z.number().nonnegative(),
    count: nonNegativeIntegerSchema,
    totalBudget: z.number().nonnegative(),
    shareOfTotalBudget: z.number().min(0).max(1).nullable()
  }),
  parsingWarnings: z.array(z.string())
});

export const evoiaMetaProjectOverrideSchema = z
  .object({
    titleRaw: z.string().trim().min(1).nullable().optional(),
    subtitleRaw: z.string().trim().min(1).nullable().optional(),
    displayTitle: z.string().trim().min(1).optional(),
    parentGroupTitle: z.string().trim().min(1).nullable().optional(),
    isSubproject: z.boolean().optional(),
    category: z.string().trim().min(1).optional(),
    fundedByRaw: z.string().trim().min(1).nullable().optional(),
    approved: z.boolean().optional(),
    includedInProgramme: z.boolean().optional(),
    openToAssignment: z.boolean().optional(),
    assigned: z.boolean().optional(),
    completed: z.boolean().optional(),
    announcedBudgetRaw: z.union([z.string().trim().min(1), z.number(), z.null()]).optional(),
    indicativeCompletionRaw: z.string().trim().min(1).nullable().optional(),
    startDateRaw: z.string().trim().min(1).nullable().optional(),
    endDateRaw: z.string().trim().min(1).nullable().optional(),
    exactStartDateRaw: z.string().trim().min(1).nullable().optional(),
    exactEndDateRaw: z.string().trim().min(1).nullable().optional(),
    durationInMonthsRaw: z.union([z.string().trim().min(1), z.number(), z.null()]).optional(),
    lastUpdateRaw: z.string().trim().min(1).nullable().optional(),
    furtheredTimeframeRaw: z.string().trim().min(1).nullable().optional(),
    budgetDifferentThanAnnouncedRaw: z.union([z.string().trim().min(1), z.number(), z.null()]).optional(),
    responsibleAgency: z.string().trim().min(1).nullable().optional(),
    privateActorInvolved: z.string().trim().min(1).nullable().optional(),
    description: z.string().trim().min(1).nullable().optional(),
    locationArea: z.string().trim().min(1).nullable().optional(),
    comments: z.string().trim().min(1).nullable().optional(),
    _note: z.string().trim().min(1).optional()
  })
  .strict();

export const evoiaMetaOverridesSchema = z.object({
  projects: z.record(evoiaMetaProjectOverrideSchema).default({})
});

export type FundingProvenance = z.infer<typeof fundingProvenanceSchema>;
export type TimelineStatus = z.infer<typeof timelineStatusSchema>;
export type IndicativeEndPrecision = z.infer<typeof indicativeEndPrecisionSchema>;
export type SourceTable = z.infer<typeof sourceTableSchema>;
export type EvoiaMetaBaseProject = z.infer<typeof evoiaMetaBaseProjectSchema>;
export type EvoiaMetaProject = z.infer<typeof evoiaMetaProjectSchema>;
export type EvoiaMetaSummary = z.infer<typeof evoiaMetaSummarySchema>;
export type EvoiaMetaProjectOverride = z.infer<typeof evoiaMetaProjectOverrideSchema>;
export type EvoiaMetaOverrides = z.infer<typeof evoiaMetaOverridesSchema>;
