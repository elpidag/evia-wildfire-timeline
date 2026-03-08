import { useMemo } from 'react';
import { getCategoryColor, getCategoryLabel } from '@/lib/timeline/categories';
import type { MediaLookup, SourceLookup, TimelineEvent } from '@/lib/timeline/types';

type EventDetailPanelProps = {
  selectedEvent: TimelineEvent | null;
  sourcesById: SourceLookup;
  mediaById: MediaLookup;
};

function splitBody(body: string): string[] {
  return body
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default function EventDetailPanel({ selectedEvent, sourcesById, mediaById }: EventDetailPanelProps) {
  const sources = useMemo(() => {
    if (!selectedEvent) {
      return [];
    }

    return selectedEvent.sourceRefs
      .map((sourceRef) => sourcesById[sourceRef])
      .filter((source): source is NonNullable<typeof source> => Boolean(source));
  }, [selectedEvent, sourcesById]);

  const images = useMemo(() => {
    if (!selectedEvent) {
      return [];
    }

    const orderedIds = [selectedEvent.coverImage, ...selectedEvent.imageRefs].filter(
      (value): value is string => Boolean(value)
    );

    const dedupedIds = [...new Set(orderedIds)];
    return dedupedIds
      .map((mediaId) => mediaById[mediaId])
      .filter((media): media is NonNullable<typeof media> => Boolean(media));
  }, [mediaById, selectedEvent]);

  if (!selectedEvent) {
    return (
      <aside className="detail-panel" aria-label="Event detail panel" aria-live="polite">
        <p className="detail-placeholder">Select an event to inspect its details.</p>
      </aside>
    );
  }

  const bodyParagraphs = splitBody(selectedEvent.body);

  return (
    <aside className="detail-panel" aria-label="Event detail panel" aria-live="polite">
      <header className="detail-header">
        <p className="detail-eyebrow">Event detail</p>
        <h2>{selectedEvent.title}</h2>
        <p className="detail-date">{selectedEvent.displayDate}</p>
        <span
          className="detail-category"
          style={{
            borderColor: getCategoryColor(selectedEvent.category),
            color: getCategoryColor(selectedEvent.category)
          }}
        >
          {getCategoryLabel(selectedEvent.category)}
        </span>
      </header>

      <section className="detail-section" aria-label="Summary">
        <h3>Summary</h3>
        <p>{selectedEvent.summary}</p>
      </section>

      <section className="detail-section" aria-label="Commentary">
        <h3>Commentary</h3>
        {bodyParagraphs.length > 0 ? (
          bodyParagraphs.map((paragraph, index) => <p key={`${selectedEvent.id}-body-${index}`}>{paragraph}</p>)
        ) : (
          <p>No extended commentary available for this event.</p>
        )}
      </section>

      <section className="detail-section" aria-label="Actors and places">
        <h3>Linked actors</h3>
        <ul>
          {selectedEvent.actorLabels.map((actor) => (
            <li key={actor.id}>{actor.name}</li>
          ))}
        </ul>

        <h3>Linked places</h3>
        <ul>
          {selectedEvent.placeLabels.map((place) => (
            <li key={place.id}>{place.name}</li>
          ))}
        </ul>

        {selectedEvent.tags.length > 0 ? (
          <>
            <h3>Tags</h3>
            <ul>
              {selectedEvent.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="detail-section" aria-label="Sources">
        <h3>Sources</h3>
        {sources.length > 0 ? (
          <ol className="detail-source-list">
            {sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                <p className="detail-source-meta">
                  {source.publisher} {source.date ? `(${source.date})` : ''}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>No source references available for this event.</p>
        )}
      </section>

      <section className="detail-section" aria-label="Images">
        <h3>Images</h3>
        {images.length > 0 ? (
          <div className="detail-image-grid">
            {images.map((image) => (
              <figure key={image.id} className="detail-figure">
                <img src={image.file} alt={image.alt} loading="lazy" />
                <figcaption>
                  <p>{image.caption}</p>
                  <p className="detail-image-credit">{image.credit}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p>No linked images available for this event.</p>
        )}
      </section>
    </aside>
  );
}
