/**
 * Pure layout engine for the Evia Meta reconstruction presentation deck.
 * Each slide is a function that takes projects + viewport dimensions
 * and returns position/style data for every bar.
 */

import type { EvoiaMetaProject } from './schema';
import {
  CATEGORY_LABELS,
  CATEGORY_SHADES,
  COLOR_MUTED,
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
  /** Multi-line title for emphasized bars (tspan rendering) */
  titleLines?: string[];
  titleLineHeight?: number;
  titleX: number;
  titleY: number;
  titleVisible: boolean;
  tagFontSize: number;
  titleFontSize: number;
  /** Budget label shown to the right of the bar (top projects only) */
  budgetText?: string;
  budgetX?: number;
  budgetFontSize?: number;
  budgetAnchor?: 'start' | 'middle';
};

export type GroupHeaderLayout = {
  key: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily?: string;
  fill?: string;
};

export type CategoryLabelLayout = {
  category: string;
  label: string;
  x: number;
  y: number;
  height: number;
  fontSize: number;
  rotation?: number;
  textAnchor?: string;
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

/** Wrap text into lines that fit within maxCharsPerLine */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (maxCharsPerLine <= 0) return [text];
  if (text.length <= maxCharsPerLine) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > maxCharsPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
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

type Slide1Options = {
  /** Use funding-origin tints instead of neutral category shades */
  fillByFunding?: boolean;
  /** Scale bar widths proportionally to announced budget */
  proportionalBudget?: boolean;
  titleText?: string;
};

export function computeSlide1Layout(
  projects: EvoiaMetaProject[],
  viewportWidth: number,
  viewportHeight: number,
  options?: Slide1Options
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

  // --- Budget proportional scaling + top project identification ---
  const minBarFraction = 0.02;
  let maxBudget = 0;
  const topProjectIds = new Set<string>();
  if (options?.proportionalBudget) {
    for (const p of filtered) {
      if (p.announcedBudget != null && p.announcedBudget > maxBudget) {
        maxBudget = p.announcedBudget;
      }
    }
    // Identify top 3 projects by budget for emphasis
    const byBudget = [...filtered]
      .filter((p) => p.announcedBudget != null && p.announcedBudget > 0)
      .sort((a, b) => (b.announcedBudget ?? 0) - (a.announcedBudget ?? 0));
    for (const p of byBudget.slice(0, 3)) {
      topProjectIds.add(p.id);
    }
  }

  const TOP_MIN_MULTIPLIER = 4;
  const barPaddingX = Math.max(4, Math.round(barWidth * 0.015));
  const budgetGap = Math.max(6, Math.round(barWidth * 0.02));

  /**
   * Compute the actual slot height a top project bar needs at a given barHeight,
   * accounting for multi-line title text that may exceed the base multiplier.
   */
  function topBarSlotHeight(project: EvoiaMetaProject, bh: number): number {
    const minH = bh * TOP_MIN_MULTIPLIER;
    if (!topProjectIds.has(project.id)) return bh;

    const tfs = Math.max(10, Math.min(20, Math.round(bh * 1.3)));
    const tcw = tfs * 0.5;
    const tlh = Math.round(tfs * 1.3);
    const wideThreshold = 15 * tcw + barPaddingX * 2;

    const budget = project.announcedBudget ?? 0;
    const fraction = maxBudget > 0 && budget > 0 ? budget / maxBudget : 0;
    let abw = Math.max(barWidth * minBarFraction, Math.round(fraction * barWidth));

    let numLines: number;
    if (abw >= wideThreshold) {
      const bfs = Math.max(10, Math.min(18, Math.round(bh * 1.0)));
      const reserve = bfs * 5 + budgetGap * 2;
      abw = Math.min(abw, barWidth - reserve);
      abw = Math.max(barWidth * minBarFraction, abw);
      const cpl = Math.max(8, Math.floor((abw - barPaddingX * 2) / tcw));
      numLines = wrapText(project.displayTitle, cpl).length;
    } else {
      const avail = barWidth - abw - budgetGap;
      const cpl = Math.max(10, Math.floor(avail / tcw));
      numLines = wrapText(project.displayTitle, cpl).length;
    }

    return Math.max(minH, numLines * tlh);
  }

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
    // Add actual extra height for each top bar (text-aware, not fixed multiplier)
    for (let c = 0; c < COLUMN_CATEGORY_ORDER.length; c++) {
      for (const cat of COLUMN_CATEGORY_ORDER[c]) {
        for (const p of grouped.get(cat) ?? []) {
          if (topProjectIds.has(p.id)) {
            colHeights[c] += topBarSlotHeight(p, barHeight) - barHeight;
          }
        }
      }
    }
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
      const shade = options?.fillByFunding ? null : (CATEGORY_SHADES[category] ?? '#e4e7ed');

      // Compute group height (bars + headers vs label)
      const catHeaderCount = countGroupHeaders(catProjects);
      const totalItems = catProjects.length + catHeaderCount;
      let totalBarHeights = 0;
      for (const p of catProjects) {
        totalBarHeights += topBarSlotHeight(p, barHeight);
      }
      const barsHeight =
        totalBarHeights +
        catHeaderCount * headerHeight +
        (totalItems - 1) * barGap;
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
        const isTop = topProjectIds.has(project.id);
        // Use text-aware slot height for top bars
        const actualBarHeight = topBarSlotHeight(project, barHeight);

        const barFill = shade ?? (FUNDING_GROUP_FILLS[project.fundingProvenance] ?? '#e4e7ed');

        // Proportional width: scale by budget / maxBudget, with a minimum
        let actualBarWidth = barWidth;
        if (options?.proportionalBudget && maxBudget > 0) {
          const budget = project.announcedBudget ?? 0;
          const fraction = budget > 0 ? budget / maxBudget : 0;
          actualBarWidth = Math.max(barWidth * minBarFraction, Math.round(fraction * barWidth));
        }

        // Top project sizing
        const topTitleFontSize = Math.max(10, Math.min(20, Math.round(barHeight * 1.3)));
        const topBudgetFontSize = Math.max(10, Math.min(18, Math.round(barHeight * 1.0)));
        const topCharWidth = topTitleFontSize * 0.5;
        const topLineHeight = Math.round(topTitleFontSize * 1.3);

        // Wide vs narrow threshold: can ≥15 chars fit per line inside the bar?
        const wideThreshold = 15 * topCharWidth + barPaddingX * 2;
        const isWideTop = isTop && actualBarWidth >= wideThreshold;
        const isNarrowTop = isTop && !isWideTop;

        // Wide top bars: cap width to leave room for budget to the right
        if (isWideTop) {
          const budgetTextReserve = topBudgetFontSize * 5 + budgetGap * 2;
          actualBarWidth = Math.min(actualBarWidth, barWidth - budgetTextReserve);
          actualBarWidth = Math.max(barWidth * minBarFraction, actualBarWidth);
        }

        // Compute title text
        const actualMaxChars = options?.proportionalBudget && !isTop
          ? Math.max(0, Math.floor((actualBarWidth - barPaddingX * 2) / charWidth))
          : maxTitleChars;

        let titleLines: string[] | undefined;
        let titleLineHeight: number | undefined;
        let titleYCenter: number;
        let titleXPos: number;

        if (isWideTop) {
          // Title inside bar, wrapping within bar width
          const charsPerLine = Math.max(8, Math.floor((actualBarWidth - barPaddingX * 2) / topCharWidth));
          titleLines = wrapText(project.displayTitle, charsPerLine);
          titleLineHeight = topLineHeight;
          const blockHeight = (titleLines.length - 1) * topLineHeight;
          titleYCenter = actualBarHeight / 2 - blockHeight / 2;
          titleXPos = barX + barPaddingX;
        } else if (isNarrowTop) {
          // Title outside bar (to the right), wrapping in remaining space
          const titleStartX = barX + actualBarWidth + budgetGap;
          const availableWidth = barWidth - actualBarWidth - budgetGap;
          const charsPerLine = Math.max(10, Math.floor(availableWidth / topCharWidth));
          titleLines = wrapText(project.displayTitle, charsPerLine);
          titleLineHeight = topLineHeight;
          const blockHeight = (titleLines.length - 1) * topLineHeight;
          titleYCenter = actualBarHeight / 2 - blockHeight / 2;
          titleXPos = titleStartX;
        } else {
          titleYCenter = actualBarHeight / 2;
          titleXPos = barX + barPaddingX;
        }

        // Budget positioning: wide → right of bar, narrow → inside bar
        let budgetText: string | undefined;
        let budgetX: number | undefined;
        let budgetFontSizeFinal: number | undefined;

        if (isTop && project.announcedBudget != null) {
          budgetText = formatBudgetTotal(project.announcedBudget);
          budgetFontSizeFinal = topBudgetFontSize;
          if (isWideTop) {
            budgetX = barX + actualBarWidth + budgetGap;
          } else {
            // Center budget inside the narrow bar
            budgetX = barX + actualBarWidth / 2;
          }
        }

        bars.push({
          id: project.id,
          x: barX,
          y: barY,
          width: actualBarWidth,
          height: actualBarHeight,
          fill: barFill,
          tag: project.tag,
          displayTag: formatDisplayTag(project.tag),
          tagX: colX + tagWidth,
          tagY: barY + actualBarHeight / 2,
          title: isTop ? project.displayTitle : truncateTitle(project.displayTitle, actualMaxChars),
          titleLines,
          titleLineHeight,
          titleX: titleXPos,
          titleY: barY + titleYCenter,
          titleVisible: isTop || actualMaxChars >= 4,
          tagFontSize,
          titleFontSize: isTop ? topTitleFontSize : titleFontSizeBar,
          budgetText,
          budgetX,
          budgetFontSize: budgetFontSizeFinal,
          budgetAnchor: isNarrowTop ? 'middle' : 'start'
        });

        cursor += actualBarHeight;
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
    titleText: options?.titleText ?? 'ANNOUNCED PROJECTS',
    titleFontFamily: FONT_DISPLAY,
    titleFontSize,
    titleX: marginX + tagWidth,
    titleY: marginTop + titleFontSize * 0.88
  };
}

/** Format a budget total for display: 372834475 → "€372.8M" */
export function formatBudgetTotal(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `€${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    return `€${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `€${Math.round(amount / 1_000)}K`;
  }
  return `€${amount.toLocaleString()}`;
}

/** Font size for the big budget total numbers at the bottom of Slide 2 columns */
export function computeTotalFontSize(viewportWidth: number): number {
  return Math.max(24, Math.min(56, Math.round(viewportWidth * 0.025)));
}

/**
 * Compute the funding-origin layout.
 * @param reserveTotalArea When true, reserves space at the bottom for budget totals
 *   (Slide 3). When false, bars use the full content height (Slide 2).
 */
export function computeSlide2Layout(
  projects: EvoiaMetaProject[],
  viewportWidth: number,
  viewportHeight: number,
  reserveTotalArea = false
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

  // --- Optionally reserve space at the bottom for budget total numbers ---
  const totalFontSize = computeTotalFontSize(viewportWidth);
  const totalAreaHeight = reserveTotalArea ? Math.round(totalFontSize * 1.6) : 0;
  const barFittingHeight = contentHeight - totalAreaHeight;

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

  const barGap = Math.max(1, Math.round(barFittingHeight * 0.003));

  // --- Find label font size and bar height that fit barFittingHeight ---
  const labelFontSize = Math.max(16, Math.min(44, Math.round(barFittingHeight * 0.032)));

  // Binary-search for barHeight within the reduced fitting area
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

    if (maxColHeight > barFittingHeight) {
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

    // Compute group height for centering within bar fitting area
    const count = groupProjects.length;
    const barsHeight = count * barHeight + (count - 1) * barGap;
    const label = FUNDING_GROUP_LABELS[fundingKey] ?? fundingKey.toUpperCase();
    const lblHeight = labelVerticalExtent(label, labelFontSize);
    const groupHeight = Math.max(barsHeight, lblHeight);

    // Center bars vertically within the bar fitting area
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

    // Column label: rotated 90° CW, centered on bar group
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

/**
 * Slide 6: Stacked horizontal bars by category budget.
 * 8 horizontal bars (one per category, sorted by total budget descending).
 * Each bar is subdivided by funding origin (public → private → other).
 * The 71 project bars morph into their category+funding segment positions.
 */
export function computeSlide6Layout(
  projects: EvoiaMetaProject[],
  viewportWidth: number,
  viewportHeight: number
): SlideLayout {
  const filtered = projects.filter((p) => !p.tag.startsWith('B'));

  // --- Margins and title area (same as other slides) ---
  const marginX = Math.round(viewportWidth * 0.05);
  const marginTop = Math.round(viewportHeight * 0.035);
  const marginBottom = Math.round(viewportHeight * 0.03);

  const titleFontSize = Math.max(20, Math.min(48, Math.round(viewportWidth * 0.022)));
  const titleAreaHeight = titleFontSize + Math.round(viewportHeight * 0.025);

  const contentTop = marginTop + titleAreaHeight;
  const contentHeight = viewportHeight - contentTop - marginBottom;
  const contentWidth = viewportWidth - marginX * 2;

  // --- Layout areas ---
  const labelAreaWidth = Math.round(contentWidth * 0.22);
  const budgetLabelWidth = Math.round(contentWidth * 0.1);
  const barAreaWidth = contentWidth - labelAreaWidth - budgetLabelWidth;
  const barAreaLeft = marginX + labelAreaWidth;

  // --- Aggregate budgets per category per funding type ---
  type CategoryAgg = {
    category: string;
    totalBudget: number;
    fundingBudgets: Map<string, number>;
    fundingProjects: Map<string, EvoiaMetaProject[]>;
  };

  const catMap = new Map<string, CategoryAgg>();
  for (const p of filtered) {
    let agg = catMap.get(p.category);
    if (!agg) {
      agg = {
        category: p.category,
        totalBudget: 0,
        fundingBudgets: new Map(),
        fundingProjects: new Map()
      };
      catMap.set(p.category, agg);
    }
    const budget = p.announcedBudget ?? 0;
    agg.totalBudget += budget;
    agg.fundingBudgets.set(p.fundingProvenance, (agg.fundingBudgets.get(p.fundingProvenance) ?? 0) + budget);
    const list = agg.fundingProjects.get(p.fundingProvenance) ?? [];
    list.push(p);
    agg.fundingProjects.set(p.fundingProvenance, list);
  }

  // Sort categories by total budget descending
  const categories = [...catMap.values()].sort((a, b) => b.totalBudget - a.totalBudget);
  const maxCategoryBudget = categories[0]?.totalBudget ?? 1;

  // --- Row sizing ---
  const rowGap = Math.max(4, Math.round(contentHeight * 0.015));
  const numCategories = categories.length;
  const totalGaps = (numCategories - 1) * rowGap;
  const rowHeight = Math.max(12, Math.floor((contentHeight - totalGaps) / numCategories));

  const labelFontSize = Math.max(12, Math.min(28, Math.round(rowHeight * 0.55)));
  const budgetFontSize = Math.max(10, Math.min(22, Math.round(rowHeight * 0.45)));

  // --- Place bars ---
  const bars: BarLayout[] = [];
  const categoryLabels: CategoryLabelLayout[] = [];
  const groupHeaders: GroupHeaderLayout[] = [];

  let rowY = contentTop;

  for (const cat of categories) {
    const totalBarWidth = maxCategoryBudget > 0
      ? Math.round((cat.totalBudget / maxCategoryBudget) * barAreaWidth)
      : 0;

    // Category label on the left
    const label = CATEGORY_LABELS[cat.category] ?? cat.category.toUpperCase();
    categoryLabels.push({
      category: cat.category,
      label,
      x: marginX + labelAreaWidth - Math.round(labelFontSize * 0.5),
      y: rowY + rowHeight / 2,
      height: rowHeight,
      fontSize: labelFontSize,
      rotation: 0,
      textAnchor: 'end'
    });

    // Budget total to the right
    groupHeaders.push({
      key: `budget-${cat.category}`,
      text: formatBudgetTotal(cat.totalBudget),
      x: barAreaLeft + totalBarWidth + Math.round(budgetFontSize * 0.5),
      y: rowY,
      width: budgetLabelWidth,
      height: rowHeight,
      fontSize: budgetFontSize,
      fontFamily: FONT_DISPLAY,
      fill: COLOR_MUTED
    });

    // Place project bars within funding segments
    let segmentX = barAreaLeft;

    for (const fundingKey of FUNDING_GROUP_ORDER) {
      const segmentBudget = cat.fundingBudgets.get(fundingKey) ?? 0;
      const segmentProjects = cat.fundingProjects.get(fundingKey) ?? [];
      if (segmentProjects.length === 0) continue;

      const segmentWidth = cat.totalBudget > 0
        ? Math.round((segmentBudget / cat.totalBudget) * totalBarWidth)
        : 0;

      // Sort projects by budget descending within segment
      const sorted = [...segmentProjects].sort(
        (a, b) => (b.announcedBudget ?? 0) - (a.announcedBudget ?? 0)
      );

      const fill = FUNDING_GROUP_FILLS[fundingKey] ?? '#e4e7ed';

      // Distribute project widths proportionally within the segment
      let projectX = segmentX;
      let remainingWidth = segmentWidth;

      for (let i = 0; i < sorted.length; i++) {
        const project = sorted[i];
        const projectBudget = project.announcedBudget ?? 0;
        let projectWidth: number;

        if (i === sorted.length - 1) {
          // Last project gets the remainder to avoid rounding gaps
          projectWidth = remainingWidth;
        } else if (segmentBudget > 0 && projectBudget > 0) {
          projectWidth = Math.max(1, Math.round((projectBudget / segmentBudget) * segmentWidth));
        } else {
          // Zero-budget: distribute equally among zero-budget projects
          const zeroBudgetCount = sorted.filter((p) => (p.announcedBudget ?? 0) === 0).length;
          projectWidth = Math.max(1, Math.round(segmentWidth / zeroBudgetCount));
        }

        projectWidth = Math.max(1, Math.min(projectWidth, remainingWidth));

        bars.push({
          id: project.id,
          x: projectX,
          y: rowY,
          width: projectWidth,
          height: rowHeight,
          fill,
          tag: project.tag,
          displayTag: formatDisplayTag(project.tag),
          tagX: projectX,
          tagY: rowY + rowHeight / 2,
          title: '',
          titleX: projectX,
          titleY: rowY + rowHeight / 2,
          titleVisible: false,
          tagFontSize: 0,
          titleFontSize: 0
        });

        projectX += projectWidth;
        remainingWidth -= projectWidth;
      }

      segmentX += segmentWidth;
    }

    rowY += rowHeight + rowGap;
  }

  return {
    bars,
    groupHeaders,
    categoryLabels,
    titleText: 'BUDGETS BY CATEGORY',
    titleFontFamily: FONT_DISPLAY,
    titleFontSize,
    titleX: marginX,
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
    return computeSlide2Layout(projects, viewportWidth, viewportHeight, false);
  }
  if (slideIndex === 2) {
    return computeSlide2Layout(projects, viewportWidth, viewportHeight, true);
  }
  if (slideIndex === 3) {
    return computeSlide1Layout(projects, viewportWidth, viewportHeight, {
      fillByFunding: true,
      titleText: 'FUNDING BY CATEGORY'
    });
  }
  if (slideIndex === 4) {
    return computeSlide1Layout(projects, viewportWidth, viewportHeight, {
      fillByFunding: true,
      proportionalBudget: true,
      titleText: 'ANNOUNCED BUDGETS'
    });
  }
  if (slideIndex === 5) {
    return computeSlide6Layout(projects, viewportWidth, viewportHeight);
  }
  return computeSlide1Layout(projects, viewportWidth, viewportHeight);
}
