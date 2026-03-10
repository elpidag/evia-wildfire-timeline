import { categoryValues } from '@/lib/data/schemas';
import type { TimelineEvent } from './types';

const categoryPalette: Partial<Record<TimelineEvent['category'], string>> = {
  wildfire: '#c74949',
  'fire-season': '#d66b5f',
  suppression: '#b85f5c',
  evacuation: '#d7b9a4',
  weather: '#4f60ad',
  flood: '#5f72ba',
  'forestry-policy': '#3f4fa1',
  legislation: '#334496',
  'spatial-planning': '#7a86b8',
  'reconstruction-governance': '#8a95bf',
  contract: '#9aa3c3',
  donation: '#aab1c4',
  'municipal-action': '#727c9d',
  'state-agency-action': '#646f93',
  'civil-society-action': '#9ea5bf',
  protest: '#b45873',
  election: '#5867a8',
  'private-actor': '#98a0b8',
  'study-report': '#a3abc0',
  infrastructure: '#6d78a8'
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

const fallbackColor = '#8a92a5';

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
