import rawProjects from '../../../data/generated/evoia-meta-projects.json';
import rawSummary from '../../../data/generated/evoia-meta-summary.json';
import { evoiaMetaProjectSchema, evoiaMetaSummarySchema, type EvoiaMetaProject, type EvoiaMetaSummary } from './schema';

export const evoiaMetaProjects: EvoiaMetaProject[] = rawProjects.map((project) => evoiaMetaProjectSchema.parse(project));
export const evoiaMetaSummary: EvoiaMetaSummary = evoiaMetaSummarySchema.parse(rawSummary);
