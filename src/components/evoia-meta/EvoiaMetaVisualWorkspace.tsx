import { useMemo, useRef, useState } from 'react';
import type { HorizonTimelineStep } from './HorizonTimeline';
import HorizonTimeline from './HorizonTimeline';
import BudgetByCategory from './BudgetByCategory';
import FundingProvenanceByCategory from './FundingProvenanceByCategory';
import { formatEuro, formatProjectCount } from '@/lib/evoia-meta/format';
import type { EvoiaMetaProject } from '@/lib/evoia-meta/schema';
import { useElementSize } from '@/lib/utils/useElementSize';

type EvoiaMetaVisualWorkspaceProps = {
  projects: EvoiaMetaProject[];
  step: HorizonTimelineStep;
  presentationMode?: boolean;
};

function compactText(value: string | null, fallback = 'None'): string {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  return value;
}

export default function EvoiaMetaVisualWorkspace({
  projects,
  step,
  presentationMode = false
}: EvoiaMetaVisualWorkspaceProps) {
  const chartsRef = useRef<HTMLDivElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { width: chartsWidth } = useElementSize(chartsRef, { width: 1200, height: 0 });

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const chartColumns = chartsWidth >= (presentationMode ? 1120 : 980) ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)';
  const typeScale = presentationMode ? 1.1 : 1;
  const totalBudget = useMemo(
    () => projects.reduce((sum, project) => sum + (project.announcedBudget ?? 0), 0),
    [projects]
  );

  return (
    <div style={{ display: 'grid', gap: presentationMode ? '1.2rem' : '1rem' }}>
      <section
        style={{
          border: '1px solid var(--color-rule)',
          background: 'var(--color-surface)',
          padding: presentationMode ? '1rem' : '0.85rem'
        }}
      >
        <header style={{ marginBottom: '0.7rem', display: 'grid', gap: '0.15rem' }}>
          <p
            style={{
              margin: 0,
              fontSize: `${0.72 * typeScale}rem`,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)'
            }}
          >
            Published horizon timeline
          </p>
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: `${0.86 * typeScale}rem` }}>
            {projects.length} projects. Announced budget {formatEuro(totalBudget)}.
          </p>
        </header>

        <HorizonTimeline
          projects={projects}
          step={step}
          selectedProjectId={selectedProjectId}
          onSelectedProjectChange={setSelectedProjectId}
        />
      </section>

      <section
        style={{
          border: '1px solid var(--color-rule)',
          background: 'var(--color-surface)',
          padding: presentationMode ? '0.95rem 1rem' : '0.8rem 0.9rem'
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: `${0.72 * typeScale}rem`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)'
          }}
        >
          Selected project
        </p>

        {selectedProject ? (
          <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
            <p style={{ margin: 0, fontSize: `${1 * typeScale}rem`, lineHeight: 1.35 }}>
              <strong>{selectedProject.tag}</strong> {selectedProject.displayTitle}
            </p>
            <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: `${0.88 * typeScale}rem` }}>
              {selectedProject.category} | {selectedProject.timelineStatus.replaceAll('_', ' ')} | {formatEuro(selectedProject.announcedBudget ?? 0)}
            </p>
            <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: `${0.86 * typeScale}rem` }}>
              Funding: {compactText(selectedProject.fundedByRaw, 'Unspecified')} ({selectedProject.fundingProvenance.replace('_', ' ')})
            </p>
            <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: `${0.86 * typeScale}rem` }}>
              Indicative completion: {compactText(selectedProject.indicativeCompletionRaw, 'No published end date')}
            </p>
            <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: `${0.86 * typeScale}rem` }}>
              End date field: {compactText(selectedProject.endDateRaw, 'Not defined')}
            </p>
            <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: `${0.86 * typeScale}rem` }}>
              Last update: {compactText(selectedProject.lastUpdateRaw, 'Not provided')}
            </p>
          </div>
        ) : (
          <p style={{ margin: '0.45rem 0 0', color: 'var(--color-muted)', fontSize: `${0.88 * typeScale}rem` }}>
            Activate a bar or row in the timeline to inspect project-level details.
          </p>
        )}
      </section>

      <div ref={chartsRef} style={{ display: 'grid', gridTemplateColumns: chartColumns, gap: presentationMode ? '1.2rem' : '1rem' }}>
        <BudgetByCategory projects={projects} />
        <FundingProvenanceByCategory projects={projects} />
      </div>

      <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: `${0.82 * typeScale}rem` }}>
        Supporting charts are based on {formatProjectCount(projects.length)} from the generated Evia Meta dataset.
      </p>
    </div>
  );
}
