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
