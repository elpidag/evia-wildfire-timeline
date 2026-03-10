/**
 * Pure layout engine for the Evia Meta reconstruction presentation deck.
 * Each slide is a function that takes projects + viewport dimensions
 * and returns position/style data for every bar.
 */

import type { EvoiaMetaProject } from './schema';
import {
  CATEGORY_LABELS,
  CATEGORY_SHADES,
  COLUMN_CATEGORY_ORDER,
  FONT_DISPLAY,
  FUNDING_GROUP_FILLS,
  FUNDING_GROUP_LABELS,
  FUNDING_GROUP_ORDER,
  LABEL_CHAR_HEIGHT_FACTOR
} from './presentation-constants';

export type BarLayout = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  tag: string;
  displayTag: string;
  tagX: number;
  tagY: number;
  title: string;
  titleX: number;
  titleY: number;
  titleVisible: boolean;
  tagFontSize: number;
  titleFontSize: number;
};

export type GroupHeaderLayout = {
  key: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
};

export type CategoryLabelLayout = {
  category: string;
  label: string;
  x: number;
  y: number;
  height: number;
  fontSize: number;
};

export type SlideLayout = {
  bars: BarLayout[];
  groupHeaders: GroupHeaderLayout[];
  categoryLabels: CategoryLabelLayout[];
  titleText: string;
  titleFontFamily: string;
  titleFontSize: number;
  titleX: number;
  titleY: number;
};

function compareTags(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function truncateTitle(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(1, maxChars - 1))}\u2026`;
}

/** Format tag for display: "A1" → "A.1", "AB51" → "AB.51" */
export function formatDisplayTag(tag: string): string {
  return tag.replace(/^([A-Z]+)(\d)/, '$1.$2');
}

/** Compute the vertical extent of a rotated label at the given font size */
function labelVerticalExtent(label: string, fontSize: number): number {
  return label.length * fontSize * LABEL_CHAR_HEIGHT_FACTOR;
}

/**
 * Count distinct parent group titles within a list of projects.
 * Each unique parentGroupTitle value produces one group header.
 */
function countGroupHeaders(catProjects: EvoiaMetaProject[]): number {
  const seen = new Set<string>();
  for (const project of catProjects) {
    if (project.parentGroupTitle) {
      seen.add(project.parentGroupTitle);
    }
  }
  return seen.size;
}

/**
 * For a given label font size, compute the total height needed by each column.
 * Each category group's height = max(barsHeight, labelHeight).
 * Group headers (for subproject parent groups) are included in the bars height.
 * Returns [col0Height, col1Height, col2Height].
 */
function computeColumnHeights(
  grouped: Map<string, EvoiaMetaProject[]>,
  labelFontSize: number,
  barHeight: number,
  barGap: number,
  categoryGap: number,
  headerHeightFactor: number
): number[] {
  const heights: number[] = [];

  for (const categories of COLUMN_CATEGORY_ORDER) {
    let colHeight = 0;
    let visibleCount = 0;

    for (const category of categories) {
      const catProjects = grouped.get(category);
      const count = catProjects?.length ?? 0;
      if (count === 0) continue;

      if (visibleCount > 0) colHeight += categoryGap;

      const headerCount = catProjects ? countGroupHeaders(catProjects) : 0;
      const headerHeight = Math.round(barHeight * headerHeightFactor);
      const totalItems = count + headerCount;
      const barsHeight = count * barHeight + headerCount * headerHeight + (totalItems - 1) * barGap;

      const label = CATEGORY_LABELS[category] ?? category.toUpperCase();
      const lblHeight = labelVerticalExtent(label, labelFontSize);
      colHeight += Math.max(barsHeight, lblHeight);
      visibleCount++;
    }

    heights.push(colHeight);
  }

  return heights;
}

export function computeSlide1Layout(
  projects: EvoiaMetaProject[],
  viewportWidth: number,
  viewportHeight: number
): SlideLayout {
  // --- Filter: only A-tagged projects (exclude B-tagged) ---
  const filtered = projects.filter((p) => !p.tag.startsWith('B'));

  // --- Margins and title area ---
  const marginX = Math.round(viewportWidth * 0.05);
  const marginTop = Math.round(viewportHeight * 0.035);
  const marginBottom = Math.round(viewportHeight * 0.03);

  const titleFontSize = Math.max(20, Math.min(48, Math.round(viewportWidth * 0.022)));
  const titleAreaHeight = titleFontSize + Math.round(viewportHeight * 0.025);

  const contentTop = marginTop + titleAreaHeight;
  const contentHeight = viewportHeight - contentTop - marginBottom;
  const contentWidth = viewportWidth - marginX * 2;

  const columnGap = Math.round(contentWidth * 0.025);
  const numColumns = 3;
  const totalColumnWidth = contentWidth - columnGap * (numColumns - 1);
  const columnWidth = totalColumnWidth / numColumns;

  // --- Group projects by category, sort by tag within each group ---
  const grouped = new Map<string, EvoiaMetaProject[]>();
  for (const project of filtered) {
    const list = grouped.get(project.category) ?? [];
    list.push(project);
    grouped.set(project.category, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => compareTags(a.tag, b.tag));
  }

  // --- Tag and label sizing (independent of bar height) ---
  const tagWidth = Math.max(28, Math.round(columnWidth * 0.08));
  const tagGap = Math.max(4, Math.round(columnWidth * 0.015));
  const categoryLabelWidth = Math.max(20, Math.round(columnWidth * 0.06));
  const barWidth = columnWidth - tagWidth - tagGap - categoryLabelWidth;

  const categoryGap = Math.round(contentHeight * 0.018);
  const barGap = Math.max(1, Math.round(contentHeight * 0.003));
  const headerHeightFactor = 0.65;

  // --- Find label font size and bar height that fit contentHeight ---
  const labelFontSize = Math.max(16, Math.min(44, Math.round(contentHeight * 0.032)));

  // Binary-search for barHeight that makes the tallest column fit contentHeight
  let barHeightLow = 6;
  let barHeightHigh = 40;
  let barHeight = 20;

  for (let i = 0; i < 20; i++) {
    barHeight = (barHeightLow + barHeightHigh) / 2;
    const colHeights = computeColumnHeights(
      grouped, labelFontSize, barHeight, barGap, categoryGap, headerHeightFactor
    );
    const maxColHeight = Math.max(...colHeights);

    if (maxColHeight > contentHeight) {
      barHeightHigh = barHeight;
    } else {
      barHeightLow = barHeight;
    }
  }

  barHeight = Math.floor(barHeightLow);
  barHeight = Math.max(6, Math.min(30, barHeight));

  const headerHeight = Math.round(barHeight * headerHeightFactor);
  const tagFontSize = Math.max(8, Math.min(16, Math.round(barHeight * 0.75)));
  const titleFontSizeBar = Math.max(7, Math.min(14, Math.round(barHeight * 0.62)));
  const headerFontSize = Math.max(7, Math.min(13, Math.round(barHeight * 0.58)));

  // Approximate characters that fit inside the bar
  const charWidth = titleFontSizeBar * 0.48;
  const barPaddingX = Math.max(4, Math.round(barWidth * 0.015));
  const maxTitleChars = Math.max(0, Math.floor((barWidth - barPaddingX * 2) / charWidth));

  // Approximate characters that fit inside a group header
  const headerCharWidth = headerFontSize * 0.52;
  const headerMaxChars = Math.max(0, Math.floor((barWidth + tagWidth + tagGap - barPaddingX * 2) / headerCharWidth));

  // --- Place bars and group headers ---
  const bars: BarLayout[] = [];
  const groupHeaders: GroupHeaderLayout[] = [];
  const categoryLabels: CategoryLabelLayout[] = [];

  for (let colIndex = 0; colIndex < numColumns; colIndex++) {
    const colX = marginX + colIndex * (columnWidth + columnGap);
    const categories = COLUMN_CATEGORY_ORDER[colIndex];
    let yOffset = contentTop;
    let visibleCatIdx = 0;

    for (const category of categories) {
      const catProjects = grouped.get(category) ?? [];
      if (catProjects.length === 0) continue;

      if (visibleCatIdx > 0) {
        yOffset += categoryGap;
      }

      const groupStartY = yOffset;
      const shade = CATEGORY_SHADES[category] ?? '#e4e7ed';

      // Compute group height (bars + headers vs label)
      const catHeaderCount = countGroupHeaders(catProjects);
      const totalItems = catProjects.length + catHeaderCount;
      const barsHeight = catProjects.length * barHeight + catHeaderCount * headerHeight + (totalItems - 1) * barGap;
      const label = CATEGORY_LABELS[category] ?? category.toUpperCase();
      const lblHeight = labelVerticalExtent(label, labelFontSize);
      const groupHeight = Math.max(barsHeight, lblHeight);

      // Center bars vertically within the group if label is taller
      const barsOffsetY = (groupHeight - barsHeight) / 2;

      // Place items using a running Y cursor
      let cursor = yOffset + barsOffsetY;
      let lastParentTitle: string | null = null;
      let isFirstItem = true;

      for (let i = 0; i < catProjects.length; i++) {
        const project = catProjects[i];

        // Insert group header before the first subproject of each parent group
        if (project.parentGroupTitle && project.parentGroupTitle !== lastParentTitle) {
          if (!isFirstItem) cursor += barGap;

          groupHeaders.push({
            key: `${category}-${project.parentGroupTitle}`,
            text: truncateTitle(`${project.parentGroupTitle}:`, headerMaxChars),
            x: colX + tagWidth + tagGap + barPaddingX,
            y: cursor,
            width: barWidth - barPaddingX,
            height: headerHeight,
            fontSize: headerFontSize
          });

          cursor += headerHeight;
          lastParentTitle = project.parentGroupTitle;
          isFirstItem = false;
        }

        if (!isFirstItem) cursor += barGap;

        const barX = colX + tagWidth + tagGap;
        const barY = cursor;

        bars.push({
          id: project.id,
          x: barX,
          y: barY,
          width: barWidth,
          height: barHeight,
          fill: shade,
          tag: project.tag,
          displayTag: formatDisplayTag(project.tag),
          tagX: colX + tagWidth,
          tagY: barY + barHeight / 2,
          title: truncateTitle(project.displayTitle, maxTitleChars),
          titleX: barX + barPaddingX,
          titleY: barY + barHeight / 2,
          titleVisible: maxTitleChars >= 4,
          tagFontSize,
          titleFontSize: titleFontSizeBar
        });

        cursor += barHeight;
        isFirstItem = false;
      }

      // Category label: rotated 90° CW, centered on group
      const labelX = colX + tagWidth + tagGap + barWidth + categoryLabelWidth / 2;
      const labelY = groupStartY + groupHeight / 2;

      categoryLabels.push({
        category,
        label,
        x: labelX,
        y: labelY,
        height: groupHeight,
        fontSize: labelFontSize
      });

      yOffset += groupHeight;
      visibleCatIdx++;
    }
  }

  return {
    bars,
    groupHeaders,
    categoryLabels,
    titleText: 'ANNOUNCED PROJECTS',
    titleFontFamily: FONT_DISPLAY,
    titleFontSize,
    titleX: marginX + tagWidth,
    titleY: marginTop + titleFontSize * 0.88
  };
}

export function computeSlide2Layout(
  projects: EvoiaMetaProject[],
  viewportWidth: number,
  viewportHeight: number
): SlideLayout {
  // --- Filter: only non-B projects ---
  const filtered = projects.filter((p) => !p.tag.startsWith('B'));

  // --- Margins and title area (same as Slide 1) ---
  const marginX = Math.round(viewportWidth * 0.05);
  const marginTop = Math.round(viewportHeight * 0.035);
  const marginBottom = Math.round(viewportHeight * 0.03);

  const titleFontSize = Math.max(20, Math.min(48, Math.round(viewportWidth * 0.022)));
  const titleAreaHeight = titleFontSize + Math.round(viewportHeight * 0.025);

  const contentTop = marginTop + titleAreaHeight;
  const contentHeight = viewportHeight - contentTop - marginBottom;
  const contentWidth = viewportWidth - marginX * 2;

  const columnGap = Math.round(contentWidth * 0.025);
  const numColumns = 3;
  const totalColumnWidth = contentWidth - columnGap * (numColumns - 1);
  const columnWidth = totalColumnWidth / numColumns;

  // --- Group projects by fundingProvenance, sort by tag within each group ---
  const grouped = new Map<string, EvoiaMetaProject[]>();
  for (const project of filtered) {
    const key = project.fundingProvenance;
    const list = grouped.get(key) ?? [];
    list.push(project);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => compareTags(a.tag, b.tag));
  }

  // --- Tag and label sizing (same as Slide 1) ---
  const tagWidth = Math.max(28, Math.round(columnWidth * 0.08));
  const tagGap = Math.max(4, Math.round(columnWidth * 0.015));
  const categoryLabelWidth = Math.max(20, Math.round(columnWidth * 0.06));
  const barWidth = columnWidth - tagWidth - tagGap - categoryLabelWidth;

  const barGap = Math.max(1, Math.round(contentHeight * 0.003));

  // --- Find label font size and bar height that fit contentHeight ---
  const labelFontSize = Math.max(16, Math.min(44, Math.round(contentHeight * 0.032)));

  // Binary-search for barHeight: tallest column is PUBLIC with 36 bars
  let barHeightLow = 6;
  let barHeightHigh = 40;
  let barHeight = 20;

  for (let i = 0; i < 20; i++) {
    barHeight = (barHeightLow + barHeightHigh) / 2;

    // Each column is a single funding group — no category gap, no group headers
    let maxColHeight = 0;
    for (const fundingKey of FUNDING_GROUP_ORDER) {
      const groupProjects = grouped.get(fundingKey) ?? [];
      const count = groupProjects.length;
      if (count === 0) continue;

      const barsHeight = count * barHeight + (count - 1) * barGap;
      const label = FUNDING_GROUP_LABELS[fundingKey] ?? fundingKey.toUpperCase();
      const lblHeight = labelVerticalExtent(label, labelFontSize);
      const colHeight = Math.max(barsHeight, lblHeight);
      if (colHeight > maxColHeight) maxColHeight = colHeight;
    }

    if (maxColHeight > contentHeight) {
      barHeightHigh = barHeight;
    } else {
      barHeightLow = barHeight;
    }
  }

  barHeight = Math.floor(barHeightLow);
  barHeight = Math.max(6, Math.min(30, barHeight));

  const tagFontSize = Math.max(8, Math.min(16, Math.round(barHeight * 0.75)));
  const titleFontSizeBar = Math.max(7, Math.min(14, Math.round(barHeight * 0.62)));

  // Approximate characters that fit inside the bar
  const charWidth = titleFontSizeBar * 0.48;
  const barPaddingX = Math.max(4, Math.round(barWidth * 0.015));
  const maxTitleChars = Math.max(0, Math.floor((barWidth - barPaddingX * 2) / charWidth));

  // --- Place bars (no group headers in Slide 2) ---
  const bars: BarLayout[] = [];
  const categoryLabels: CategoryLabelLayout[] = [];

  for (let colIndex = 0; colIndex < numColumns; colIndex++) {
    const fundingKey = FUNDING_GROUP_ORDER[colIndex];
    const colX = marginX + colIndex * (columnWidth + columnGap);
    const groupProjects = grouped.get(fundingKey) ?? [];
    if (groupProjects.length === 0) continue;

    const fill = FUNDING_GROUP_FILLS[fundingKey] ?? '#e4e7ed';

    // Compute group height for centering
    const count = groupProjects.length;
    const barsHeight = count * barHeight + (count - 1) * barGap;
    const label = FUNDING_GROUP_LABELS[fundingKey] ?? fundingKey.toUpperCase();
    const lblHeight = labelVerticalExtent(label, labelFontSize);
    const groupHeight = Math.max(barsHeight, lblHeight);

    // Center bars vertically within the group if label is taller
    const barsOffsetY = (groupHeight - barsHeight) / 2;
    let cursor = contentTop + barsOffsetY;

    for (let i = 0; i < groupProjects.length; i++) {
      const project = groupProjects[i];
      if (i > 0) cursor += barGap;

      const barX = colX + tagWidth + tagGap;
      const barY = cursor;

      bars.push({
        id: project.id,
        x: barX,
        y: barY,
        width: barWidth,
        height: barHeight,
        fill,
        tag: project.tag,
        displayTag: formatDisplayTag(project.tag),
        tagX: colX + tagWidth,
        tagY: barY + barHeight / 2,
        title: truncateTitle(project.displayTitle, maxTitleChars),
        titleX: barX + barPaddingX,
        titleY: barY + barHeight / 2,
        titleVisible: maxTitleChars >= 4,
        tagFontSize,
        titleFontSize: titleFontSizeBar
      });

      cursor += barHeight;
    }

    // Column label: rotated 90° CW, centered on group
    const labelX = colX + tagWidth + tagGap + barWidth + categoryLabelWidth / 2;
    const labelY = contentTop + groupHeight / 2;

    categoryLabels.push({
      category: fundingKey,
      label,
      x: labelX,
      y: labelY,
      height: groupHeight,
      fontSize: labelFontSize
    });
  }

  return {
    bars,
    groupHeaders: [],
    categoryLabels,
    titleText: 'FUNDING ORIGIN',
    titleFontFamily: FONT_DISPLAY,
    titleFontSize,
    titleX: marginX + tagWidth,
    titleY: marginTop + titleFontSize * 0.88
  };
}

export function computeSlideLayout(
  projects: EvoiaMetaProject[],
  viewportWidth: number,
  viewportHeight: number,
  slideIndex: number
): SlideLayout {
  if (slideIndex === 1) {
    return computeSlide2Layout(projects, viewportWidth, viewportHeight);
  }
  return computeSlide1Layout(projects, viewportWidth, viewportHeight);
}
