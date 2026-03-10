/**
 * Shared constants for the Evia Meta reconstruction presentation deck.
 */

export const CATEGORY_ORDER = [
  'Infrastructure',
  'General',
  'Forest',
  'Agrifood sector',
  'Human Resources',
  'Healthcare & Welfare',
  'Tourism',
  'Culture'
] as const;

export type PresentationCategory = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  Infrastructure: 'INFRASTRUCTURE',
  General: 'GENERAL',
  Forest: 'FOREST',
  'Agrifood sector': 'AGRIFOOD',
  'Human Resources': 'HUMAN RESOURCES',
  'Healthcare & Welfare': 'HEALTHCARE & WELFARE',
  Tourism: 'TOURISM',
  Culture: 'CULTURE'
};

/** Distinct neutral gray shades per category — no blue tint */
export const CATEGORY_SHADES: Record<string, string> = {
  Infrastructure: '#ececec',
  General: '#ececec',
  Forest: '#e0e0e0',
  'Agrifood sector': '#e6e6e6',
  'Human Resources': '#d0d0d0',
  'Healthcare & Welfare': '#d8d8d8',
  Tourism: '#d3d3d3',
  Culture: '#dbdbdb'
};

/**
 * Column assignments balanced for non-B-tagged projects:
 * col0: Infrastructure(4) + Healthcare(8) + Tourism(8) = 20
 * col1: Forest(16) + HR(10) = 26
 * col2: Agrifood(9) + Culture(14) + General(2) = 25
 * Note: Forest has 2 group headers (Forest economy, Reforestation) adding visual height.
 */
export const COLUMN_ASSIGNMENTS: Record<string, number> = {
  Infrastructure: 0,
  'Healthcare & Welfare': 0,
  Tourism: 0,
  Forest: 1,
  'Human Resources': 1,
  'Agrifood sector': 2,
  Culture: 2,
  General: 2
};

/** Category order within each column (top to bottom) */
export const COLUMN_CATEGORY_ORDER: string[][] = [
  ['Infrastructure', 'Healthcare & Welfare', 'Tourism'],
  ['Forest', 'Human Resources'],
  ['Agrifood sector', 'Culture', 'General']
];

/** Slide 2: Funding origin groups — column order left to right */
export const FUNDING_GROUP_ORDER = ['public', 'private_philanthropy', 'mixed_unclear'] as const;

export const FUNDING_GROUP_LABELS: Record<string, string> = {
  public: 'PUBLIC',
  mixed_unclear: 'OTHER',
  private_philanthropy: 'PRIVATE'
};

export const FUNDING_GROUP_FILLS: Record<string, string> = {
  public: '#d4d8ec',
  mixed_unclear: '#e0e0e0',
  private_philanthropy: '#ebd4d4'
};

export const TRANSITION_MS = 600;

export const FONT_DISPLAY = "'bebas-neue-pro', 'Bebas Neue Pro', 'Bebas Neue', 'Arial Narrow', sans-serif";
export const FONT_BODY = "'adobe-garamond-pro', 'Adobe Garamond Pro', Garamond, 'Times New Roman', serif";
export const COLOR_TEXT = '#1f2f8f';
export const COLOR_MUTED = '#5f6a93';
export const COLOR_CATEGORY_LABEL = '#c3c8d3';

/**
 * Approximate width of a single character in the display font
 * when rendered vertically (as a fraction of font-size).
 * Bebas Neue Pro is condensed, so characters are narrow.
 */
export const LABEL_CHAR_HEIGHT_FACTOR = 0.58;
