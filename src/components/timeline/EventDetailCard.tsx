import type { TimelineEvent } from '@/lib/timeline/types';
import { getCategorySvgIcon } from '@/lib/timeline/categories';

const ICON_BASE = '/images/legend/';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

type Props = {
  event: TimelineEvent;
};

export default function EventDetailCard({ event }: Props) {
  const hasDur = !!(event.endTs && event.endTs !== event.startTs);
  const spatialIcons: Record<string, string> = {
    'phase-i': '_spatialplanning-phase1.svg',
    'phase-ii': '_spatialplanning-phase2.svg',
    'phase-iii': '_spatialplanning-completed.svg',
  };
  const isSpatial = event.summary.includes('Special Urban Planning');
  const iconFile = event.slug === 'works-by-the-forestry-service'
    ? '_forestryserviceworks.svg'
    : isSpatial
      ? (spatialIcons[event.slug] ?? '_spatialplanning-phase1.svg')
      : getCategorySvgIcon(event.category, hasDur);
  const iconHref = `${ICON_BASE}${iconFile}`;
  const dateStr = hasDur
    ? `${fmtDate(event.startTs)} — ${fmtDate(event.endTs!)}`
    : fmtDate(event.startTs);

  return (
    <div className="event-detail-card">
      <div className="event-detail-header">
        <img src={iconHref} alt="" className="event-detail-icon" />
        <span className="event-detail-date">{dateStr}</span>
      </div>
      <div className="event-detail-summary">{event.summary}</div>
    </div>
  );
}
