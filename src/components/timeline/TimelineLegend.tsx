import type { TimelineEvent } from '@/lib/timeline/types';

type TimelineLegendProps = {
  events: TimelineEvent[];
};

const ICON = '/images/legend/';

/** 16×16 point icon */
function Icon({ src, alt }: { src: string; alt?: string }) {
  return <img className="legend-icon" src={`${ICON}${src}`} alt={alt ?? ''} aria-hidden="true" />;
}

/** 24×14 wide / duration icon */
function WideIcon({ src, alt }: { src: string; alt?: string }) {
  return <img className="legend-icon-wide" src={`${ICON}${src}`} alt={alt ?? ''} aria-hidden="true" />;
}

export default function TimelineLegend({ events: _events }: TimelineLegendProps) {
  return (
    <section className="legend-panel" aria-label="Timeline legend">
      {/* Row 1 */}
      <div className="legend-row">
        <span className="legend-entry">
          <WideIcon src="_activefire.svg" />
          <span>Active Fire</span>
        </span>
        <span className="legend-entry">
          <WideIcon src="_periduntilfullsuppression.svg" />
          <span>Period between suppression of the main fronts and full suppression</span>
        </span>
        <span className="legend-entry">
          <WideIcon src="_flood.svg" />
          <span>Flood and extreme rainfall</span>
        </span>
        <span className="legend-entry">
          <WideIcon src="_forestryserviceworks.svg" />
          <span>Forestry Service works</span>
        </span>
      </div>

      {/* Row 2 */}
      <div className="legend-row">
        <span className="legend-entry">
          <Icon src="_legislationchanges.svg" />
          <span>Legislation changes</span>
        </span>
        <span className="legend-entry">
          <Icon src="_legislationchangesforestmanagement.svg" />
          <span>Legislation changes about forest management</span>
        </span>
        <span className="legend-entry">
          <Icon src="_generalelections.svg" />
          <span>Elections</span>
        </span>
      </div>

      {/* Row 3: section header */}
      <div className="legend-row legend-section-label">
        Announcements-Events-Meetings organised by
      </div>

      {/* Rows 4–9: dual-symbol entries (1-day point + multi-day duration) */}
      <div className="legend-row">
        <span className="legend-entry">
          <Icon src="_civilsociety.svg" />
          <WideIcon src="_civilsocitey-morethan1day.svg" />
          <span>civil society</span>
        </span>
      </div>
      <div className="legend-row">
        <span className="legend-entry">
          <Icon src="_centralgreekgovernment1dayevent.svg" />
          <WideIcon src="_centralgreekgovernment-morethan1day.svg" />
          <span>central greek government</span>
        </span>
      </div>
      <div className="legend-row">
        <span className="legend-entry">
          <Icon src="_regionalgovernmentandlocalmunicipalites1dayevent.svg" />
          <WideIcon src="_regionalgovernmentlocalmunicipalities-morethan1day.svg" />
          <span>regional government &amp; local municipalities</span>
        </span>
      </div>
      <div className="legend-row">
        <span className="legend-entry">
          <Icon src="_otherstateagencies1dayevent.svg" />
          <WideIcon src="_otherstateagencies-morethanoneday.svg" />
          <span>other official state agencies</span>
        </span>
      </div>
      <div className="legend-row">
        <span className="legend-entry">
          <Icon src="_diazomaevents1dayevent.svg" />
          <WideIcon src="_diazomaevents-morethan1day.svg" />
          <span>Meetings-Events organised by &lsquo;DIAZOMA&rsquo;</span>
        </span>
      </div>
      <div className="legend-row">
        <span className="legend-entry">
          <Icon src="_contractdiazoma1dayevent.svg" />
          <WideIcon src="_contractssigningduration.svg" />
          <span>Contracts signed between &lsquo;DIAZOMA&rsquo;, donors &amp; consultant agencies</span>
        </span>
      </div>

      {/* Row 10 */}
      <div className="legend-row">
        <span className="legend-entry">
          <Icon src="_announcementprivateentities1dayevent.svg" />
          <span>Announcements-Events-Actions by private entities</span>
        </span>
      </div>

      {/* Row 11 – Spatial Planning Phases */}
      <div className="legend-row">
        <span className="legend-entry">
          <WideIcon src="_spatialplanning-phase1.svg" />
          <WideIcon src="_spatialplanning-phase2.svg" />
          <WideIcon src="_spatialplanning-completed.svg" />
          <span>Spatial Planning Phases</span>
        </span>
      </div>
    </section>
  );
}
