import { hasActiveFilters, type TimelineFilterOptions, type TimelineFilterState } from '@/lib/timeline';

type TimelineFiltersProps = {
  filters: TimelineFilterState;
  options: TimelineFilterOptions;
  totalCount: number;
  resultCount: number;
  onChange: (next: TimelineFilterState) => void;
  onReset: () => void;
};

type MultiValueFilterKey = 'categories' | 'actors' | 'places' | 'tags';

function toggleSelection(
  filters: TimelineFilterState,
  key: MultiValueFilterKey,
  value: string
): TimelineFilterState {
  const current = filters[key] as string[];
  const exists = current.includes(value);
  const next = exists ? current.filter((item) => item !== value) : [...current, value];

  return {
    ...filters,
    [key]: next
  } as TimelineFilterState;
}

function renderEmptyOptionMessage(label: string) {
  return <p className="filter-empty">{`No ${label.toLowerCase()} available in this dataset.`}</p>;
}

export default function TimelineFilters({
  filters,
  options,
  totalCount,
  resultCount,
  onChange,
  onReset
}: TimelineFiltersProps) {
  const isActive = hasActiveFilters(filters);

  return (
    <section className="filter-panel" aria-label="Timeline filters">
      <header className="filter-panel-header">
        <div>
          <p className="filter-panel-eyebrow">Filters</p>
          <p className="filter-panel-status" aria-live="polite">
            Showing {resultCount} of {totalCount} events
          </p>
        </div>
        <button type="button" className="timeline-button" onClick={onReset} disabled={!isActive}>
          Reset filters
        </button>
      </header>

      <div className="filter-grid">
        <fieldset className="filter-group">
          <legend>Category</legend>
          {options.categories.length === 0
            ? renderEmptyOptionMessage('categories')
            : options.categories.map((option) => (
                <label key={option.id} className="filter-option">
                  <input
                    type="checkbox"
                    checked={filters.categories.includes(option.id)}
                    onChange={() => onChange(toggleSelection(filters, 'categories', option.id))}
                  />
                  <span>{option.label}</span>
                  <span className="filter-count">{option.count}</span>
                </label>
              ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend>Actor</legend>
          {options.actors.length === 0
            ? renderEmptyOptionMessage('actors')
            : options.actors.map((option) => (
                <label key={option.id} className="filter-option">
                  <input
                    type="checkbox"
                    checked={filters.actors.includes(option.id)}
                    onChange={() => onChange(toggleSelection(filters, 'actors', option.id))}
                  />
                  <span>{option.label}</span>
                  <span className="filter-count">{option.count}</span>
                </label>
              ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend>Place</legend>
          {options.places.length === 0
            ? renderEmptyOptionMessage('places')
            : options.places.map((option) => (
                <label key={option.id} className="filter-option">
                  <input
                    type="checkbox"
                    checked={filters.places.includes(option.id)}
                    onChange={() => onChange(toggleSelection(filters, 'places', option.id))}
                  />
                  <span>{option.label}</span>
                  <span className="filter-count">{option.count}</span>
                </label>
              ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend>Tags</legend>
          {options.tags.length === 0
            ? renderEmptyOptionMessage('tags')
            : options.tags.map((option) => (
                <label key={option.id} className="filter-option">
                  <input
                    type="checkbox"
                    checked={filters.tags.includes(option.id)}
                    onChange={() => onChange(toggleSelection(filters, 'tags', option.id))}
                  />
                  <span>{option.label}</span>
                  <span className="filter-count">{option.count}</span>
                </label>
              ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend>Date range</legend>
          <label className="filter-date-field">
            <span>From</span>
            <input
              type="date"
              value={filters.from ?? ''}
              min={options.minDate ?? undefined}
              max={options.maxDate ?? undefined}
              onChange={(event) =>
                onChange({
                  ...filters,
                  from: event.target.value.trim() === '' ? null : event.target.value
                })
              }
            />
          </label>
          <label className="filter-date-field">
            <span>To</span>
            <input
              type="date"
              value={filters.to ?? ''}
              min={options.minDate ?? undefined}
              max={options.maxDate ?? undefined}
              onChange={(event) =>
                onChange({
                  ...filters,
                  to: event.target.value.trim() === '' ? null : event.target.value
                })
              }
            />
          </label>
        </fieldset>
      </div>
    </section>
  );
}
