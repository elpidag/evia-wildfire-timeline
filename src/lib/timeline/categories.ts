import { categoryValues } from '@/lib/data/schemas';
import type { TimelineEvent } from './types';

const categoryPalette: Partial<Record<TimelineEvent['category'], string>> = {
  wildfire: '#c54644',
  'fire-season': '#c54644',
  suppression: '#b85f5c',
  evacuation: '#d7b9a4',
  weather: '#4f60ad',
  flood: '#5f72ba',
  'forestry-policy': '#84b87b',
  legislation: '#334496',
  'spatial-planning': '#939393',
  'reconstruction-governance': '#8a95bf',
  contract: '#7376c6',
  donation: '#aab1c4',
  'municipal-action': '#273891',
  'state-agency-action': '#646f93',
  'civil-society-action': '#84b87b',
  protest: '#84b87b',
  election: '#5867a8',
  'private-actor': '#98a0b8',
  'study-report': '#a3abc0',
  infrastructure: '#6d78a8'
};

const categoryNameMap: Record<TimelineEvent['category'], string> = {
  wildfire: 'Fire',
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

// Maps each category to its legend SVG files:
// point = single-day event icon (16×16), duration = multi-day bar icon (24×14)
const symbolSvgMap: Partial<Record<TimelineEvent['category'], { point: string; duration: string }>> = {
  wildfire:               { point: '_activefire.svg',                                    duration: '_activefire.svg' },
  suppression:            { point: '_periduntilfullsuppression.svg',                     duration: '_periduntilfullsuppression.svg' },
  flood:                  { point: '_flood.svg',                                         duration: '_flood.svg' },
  'forestry-policy':      { point: '_forestryserviceworks.svg',                           duration: '_forestryserviceworks.svg' },
  legislation:            { point: '_legislationchanges.svg',                             duration: '_legislationchanges.svg' },
  election:               { point: '_generalelections.svg',                               duration: '_generalelections.svg' },
  'civil-society-action': { point: '_civilsociety.svg',                                   duration: '_civilsocitey-morethan1day.svg' },
  protest:                { point: '_civilsociety.svg',                                   duration: '_civilsocitey-morethan1day.svg' },
  'state-agency-action':  { point: '_otherstateagencies1dayevent.svg',                    duration: '_otherstateagencies-morethanoneday.svg' },
  'reconstruction-governance': { point: '_centralgreekgovernment1dayevent.svg',           duration: '_centralgreekgovernment-morethan1day.svg' },
  'municipal-action':     { point: '_regionalgovernmentandlocalmunicipalites1dayevent.svg', duration: '_regionalgovernmentlocalmunicipalities-morethan1day.svg' },
  contract:               { point: '_contractdiazoma1dayevent.svg',                       duration: '_contractssigningduration.svg' },
  donation:               { point: '_contractdiazoma1dayevent.svg',                       duration: '_contractssigningduration.svg' },
  'private-actor':        { point: '_announcementprivateentities1dayevent.svg',            duration: '_announcementprivateentities1dayevent.svg' },
  'spatial-planning':     { point: '_spatialplanning-phase1.svg',                         duration: '_spatialplanning-phase1.svg' },
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

/**
 * Returns the SVG icon path for a given category.
 * `isDuration` selects between the point (1-day) and duration (multi-day) variant.
 */
export function getCategorySvgIcon(category: TimelineEvent['category'], isDuration: boolean): string {
  const entry = symbolSvgMap[category];
  if (!entry) return '_otherstateagencies1dayevent.svg';
  return isDuration ? entry.duration : entry.point;
}
