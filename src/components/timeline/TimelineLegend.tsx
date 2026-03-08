import {
  categoryOrder,
  getCategoryColor,
  getCategoryLabel,
  getCategorySymbol,
  type CategorySymbol
} from '@/lib/timeline/categories';
import type { TimelineEvent } from '@/lib/timeline/types';

type TimelineLegendProps = {
  events: TimelineEvent[];
};

function renderSymbol(symbol: CategorySymbol, color: string) {
  if (symbol === 'square') {
    return <rect x="3" y="3" width="10" height="10" fill={color} />;
  }

  if (symbol === 'diamond') {
    return <polygon points="8,2 14,8 8,14 2,8" fill={color} />;
  }

  if (symbol === 'triangle') {
    return <polygon points="8,2 14,14 2,14" fill={color} />;
  }

  return <circle cx="8" cy="8" r="5" fill={color} />;
}

export default function TimelineLegend({ events }: TimelineLegendProps) {
  const presentCategories = categoryOrder.filter((category) => events.some((event) => event.category === category));

  return (
    <section className="legend-panel" aria-label="Timeline legend">
      <header className="legend-header">
        <p className="detail-eyebrow">Legend</p>
      </header>

      <div className="legend-static">
        <p className="legend-static-row">
          <span className="legend-fire-season-swatch" aria-hidden="true" />
          Fire season marker: 30 April to 30 October (every year)
        </p>
        <p className="legend-static-row">
          <span className="legend-divider-swatch" aria-hidden="true" />
          Thick center line split: upper band = Evia island, lower band = rest of Greece
        </p>
      </div>

      <ul className="legend-list">
        {presentCategories.map((category) => {
          const color = getCategoryColor(category);
          const symbol = getCategorySymbol(category);

          return (
            <li key={category} className="legend-item">
              <svg className="legend-symbol" viewBox="0 0 16 16" aria-hidden="true">
                {renderSymbol(symbol, color)}
              </svg>
              <span className="legend-label">{getCategoryLabel(category)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
