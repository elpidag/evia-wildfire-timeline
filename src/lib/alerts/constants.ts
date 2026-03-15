import type { FireRegion } from './schema';

/** Muted region colors — forensic-editorial palette */
export const REGION_COLORS: Record<FireRegion | string, string> = {
  evia: '#c74949',
  attica_north: '#7882aa',
  attica_west: '#aa7880',
  attica_south: '#8a7aaa',
  messinia: '#7aaa82',
  ilia: '#aa9a6a',
  fokida: '#6a8aaa',
  rhodes: '#9a7a6a',
  arcadia: '#6aaa8a',
  corinthia: '#8a8a7a',
  grevena: '#7a8a6a',
  other: '#909090'
};

/** Human-readable region labels */
export const REGION_LABELS: Record<FireRegion | string, string> = {
  evia: 'North Evia',
  attica_north: 'Varympompi / N. Attica',
  attica_west: 'Vilia / W. Attica',
  attica_south: 'S. Attica',
  messinia: 'Messinia',
  ilia: 'Ilia / Olympia',
  fokida: 'Fokida',
  rhodes: 'Rhodes',
  arcadia: 'Arcadia / Gortynia',
  corinthia: 'Corinthia',
  grevena: 'Grevena',
  other: 'Other'
};

/** Alert type display labels */
export const ALERT_TYPE_LABELS: Record<string, string> = {
  evacuation: 'Evacuation',
  shelter_in_place: 'Shelter in place',
  fire_danger: 'Fire danger',
  general: 'General'
};

/** Map viewports per region filter */
export const MAP_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  all:    { center: [23.6, 38.5], zoom: 8.3 },
  evia:   { center: [23.249, 38.834], zoom: 9.5 },
  attica: { center: [23.598, 38.190], zoom: 9 },
};

/** Default map viewport (used for initial load) */
export const MAP_CENTER: [number, number] = MAP_VIEWS.all.center;
export const MAP_ZOOM = MAP_VIEWS.all.zoom;

/** Playback constants */
export const PLAYBACK_SPEEDS = [1, 2, 5, 10] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** 1x speed: 1 real second = 1 simulated hour */
export const BASE_SECONDS_PER_HOUR = 1;

/** Timeline domain */
export const TIMELINE_START = new Date('2021-08-01T00:00:00+03:00');
export const TIMELINE_END = new Date('2021-08-24T00:00:00+03:00');
