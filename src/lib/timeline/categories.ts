import { categoryValues } from '@/lib/data/schemas';
import type { TimelineEvent } from './types';

const categoryPalette: Partial<Record<TimelineEvent['category'], string>> = {
  wildfire: '#93342a',
  'fire-season': '#ad4b3c',
  suppression: '#714e2d',
  evacuation: '#8f5b33',
  weather: '#536878',
  flood: '#4d6272',
  'forestry-policy': '#3f5564',
  legislation: '#364c5a',
  'spatial-planning': '#5a5f74',
  'reconstruction-governance': '#8f7a45',
  contract: '#9f8a55',
  donation: '#8f845f',
  'municipal-action': '#6a6c5a',
  'state-agency-action': '#5b5f54',
  'civil-society-action': '#6e596f',
  protest: '#7b4b55',
  election: '#554e73',
  'private-actor': '#635d47',
  'study-report': '#59646b',
  infrastructure: '#5f624f'
};

const categoryNameMap: Record<TimelineEvent['category'], string> = {
  wildfire: 'Wildfire',
  'fire-season': 'Fire Season',
  suppression: 'Suppression',
  evacuation: 'Evacuation',
  weather: 'Weather',
  flood: 'Flood',
  'forestry-policy': 'Forestry Policy',
  legislation: 'Legislation',
  'spatial-planning': 'Spatial Planning',
  'reconstruction-governance': 'Reconstruction Governance',
  contract: 'Contract',
  donation: 'Donation',
  'municipal-action': 'Municipal Action',
  'state-agency-action': 'State Agency Action',
  'civil-society-action': 'Civil Society Action',
  protest: 'Protest',
  election: 'Election',
  'private-actor': 'Private Actor',
  'study-report': 'Study Report',
  infrastructure: 'Infrastructure'
};

const fallbackColor = '#6f6a61';

export const categoryOrder: TimelineEvent['category'][] = [...categoryValues];
export type CategorySymbol = 'circle' | 'square' | 'diamond' | 'triangle';

const symbolCycle: CategorySymbol[] = ['circle', 'square', 'diamond', 'triangle'];
const categorySymbolMap: Record<TimelineEvent['category'], CategorySymbol> = Object.fromEntries(
  categoryOrder.map((category, index) => [category, symbolCycle[index % symbolCycle.length]])
) as Record<TimelineEvent['category'], CategorySymbol>;

export function getCategoryColor(category: TimelineEvent['category']): string {
  return categoryPalette[category] ?? fallbackColor;
}

export function getCategoryLabel(category: TimelineEvent['category']): string {
  return categoryNameMap[category] ?? category;
}

export function getCategorySymbol(category: TimelineEvent['category']): CategorySymbol {
  return categorySymbolMap[category] ?? 'circle';
}
