import { MEGA_PROJECT_THRESHOLD } from './derive';
import {
  evoiaMetaSummarySchema,
  type EvoiaMetaProject,
  type EvoiaMetaSummary,
  type FundingProvenance,
  type TimelineStatus
} from './schema';

type CategorySummary = {
  category: string;
  projectCount: number;
  totalBudget: number;
};

export type BudgetByCategoryDatum = {
  category: string;
  totalBudget: number;
  projectCount: number;
  megaProjectCount: number;
};

export type FundingProvenanceByCategoryDatum = {
  category: string;
  totalProjects: number;
  counts: Record<FundingProvenance, number>;
  shares: Record<FundingProvenance, number>;
};

function initFundingCounts(): Record<FundingProvenance, number> {
  return {
    public: 0,
    private_philanthropy: 0,
    mixed_unclear: 0
  };
}

function initTimelineCounts(): Record<TimelineStatus, number> {
  return {
    completed: 0,
    past_due_unfinished: 0,
    ongoing: 0,
    undated: 0
  };
}

function buildCategorySummary(projects: EvoiaMetaProject[]): CategorySummary[] {
  const categoryMap = new Map<string, CategorySummary>();

  projects.forEach((project) => {
    const existing = categoryMap.get(project.category);
    if (existing) {
      existing.projectCount += 1;
      existing.totalBudget += project.announcedBudget ?? 0;
      return;
    }

    categoryMap.set(project.category, {
      category: project.category,
      projectCount: 1,
      totalBudget: project.announcedBudget ?? 0
    });
  });

  return [...categoryMap.values()].sort((a, b) => {
    if (b.totalBudget !== a.totalBudget) {
      return b.totalBudget - a.totalBudget;
    }
    return a.category.localeCompare(b.category);
  });
}

export function selectBudgetByCategory(
  projects: EvoiaMetaProject[],
  options: { includeMegaProjects?: boolean } = {}
): BudgetByCategoryDatum[] {
  const includeMegaProjects = options.includeMegaProjects ?? true;
  const categoryMap = new Map<string, BudgetByCategoryDatum>();

  projects.forEach((project) => {
    if (!includeMegaProjects && project.isMegaProject) {
      return;
    }

    const existing = categoryMap.get(project.category);
    if (existing) {
      existing.projectCount += 1;
      existing.totalBudget += project.announcedBudget ?? 0;
      if (project.isMegaProject) {
        existing.megaProjectCount += 1;
      }
      return;
    }

    categoryMap.set(project.category, {
      category: project.category,
      totalBudget: project.announcedBudget ?? 0,
      projectCount: 1,
      megaProjectCount: project.isMegaProject ? 1 : 0
    });
  });

  return [...categoryMap.values()].sort((a, b) => {
    if (b.totalBudget !== a.totalBudget) {
      return b.totalBudget - a.totalBudget;
    }
    return a.category.localeCompare(b.category);
  });
}

function initFundingCountRecord(): Record<FundingProvenance, number> {
  return {
    public: 0,
    private_philanthropy: 0,
    mixed_unclear: 0
  };
}

export function selectFundingProvenanceByCategory(projects: EvoiaMetaProject[]): FundingProvenanceByCategoryDatum[] {
  const categoryMap = new Map<string, FundingProvenanceByCategoryDatum>();

  projects.forEach((project) => {
    const existing = categoryMap.get(project.category);
    if (existing) {
      existing.totalProjects += 1;
      existing.counts[project.fundingProvenance] += 1;
      return;
    }

    const counts = initFundingCountRecord();
    counts[project.fundingProvenance] += 1;

    categoryMap.set(project.category, {
      category: project.category,
      totalProjects: 1,
      counts,
      shares: initFundingCountRecord()
    });
  });

  const rows = [...categoryMap.values()].sort((a, b) => {
    if (b.totalProjects !== a.totalProjects) {
      return b.totalProjects - a.totalProjects;
    }
    return a.category.localeCompare(b.category);
  });

  rows.forEach((row) => {
    const denominator = Math.max(1, row.totalProjects);
    row.shares.public = row.counts.public / denominator;
    row.shares.private_philanthropy = row.counts.private_philanthropy / denominator;
    row.shares.mixed_unclear = row.counts.mixed_unclear / denominator;
  });

  return rows;
}

function getDateExtent(projects: EvoiaMetaProject[]): EvoiaMetaSummary['dateExtent'] {
  const datedProjects = projects
    .filter((project) => project.hasUsableEndDate && project.indicativeEndDateISO)
    .map((project) => project.indicativeEndDateISO as string)
    .sort();

  return {
    minIndicativeEndDateISO: datedProjects.length > 0 ? datedProjects[0] : null,
    maxIndicativeEndDateISO: datedProjects.length > 0 ? datedProjects[datedProjects.length - 1] : null,
    usableEndDateCount: datedProjects.length,
    undatedCount: projects.length - datedProjects.length
  };
}

export function buildEvoiaMetaSummary(
  projects: EvoiaMetaProject[],
  parsingWarnings: string[],
  todayISO: string
): EvoiaMetaSummary {
  const totalBudget = projects.reduce((sum, project) => sum + (project.announcedBudget ?? 0), 0);
  const fundingProvenanceCounts = initFundingCounts();
  const timelineStatusCounts = initTimelineCounts();

  projects.forEach((project) => {
    fundingProvenanceCounts[project.fundingProvenance] += 1;
    timelineStatusCounts[project.timelineStatus] += 1;
  });

  const megaProjects = projects.filter((project) => project.isMegaProject);
  const megaProjectBudget = megaProjects.reduce((sum, project) => sum + (project.announcedBudget ?? 0), 0);

  return evoiaMetaSummarySchema.parse({
    generatedAt: new Date().toISOString(),
    todayISO,
    totalProjects: projects.length,
    totalBudget,
    categories: buildCategorySummary(projects),
    fundingProvenanceCounts,
    timelineStatusCounts,
    dateExtent: getDateExtent(projects),
    megaProjectStats: {
      threshold: MEGA_PROJECT_THRESHOLD,
      count: megaProjects.length,
      totalBudget: megaProjectBudget,
      shareOfTotalBudget: totalBudget > 0 ? megaProjectBudget / totalBudget : null
    },
    parsingWarnings
  });
}
