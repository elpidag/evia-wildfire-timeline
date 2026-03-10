import { useEffect, useMemo, useRef, useState } from 'react';
import EvoiaMetaVisualWorkspace from './EvoiaMetaVisualWorkspace';
import type { HorizonTimelineStep } from './HorizonTimeline';
import type { EvoiaMetaProject, EvoiaMetaSummary } from '@/lib/evoia-meta/schema';
import { formatEuro, formatPercent } from '@/lib/evoia-meta/format';
import { useElementSize } from '@/lib/utils/useElementSize';

type ReconstructionWebsiteModuleProps = {
  projects: EvoiaMetaProject[];
  summary: EvoiaMetaSummary;
};

type NarrativeStep = {
  step: HorizonTimelineStep;
  label: string;
  title: string;
  body: string;
};

const narrativeSteps: NarrativeStep[] = [
  {
    step: 'table',
    label: 'Step 1',
    title: 'Audit the register as evidence',
    body:
      'Start with the publication fields as they are reported. This keeps uncertainty visible and prevents the visualization from implying precision that does not exist in the source register.'
  },
  {
    step: 'bars',
    label: 'Step 2',
    title: 'Shift to the published horizon',
    body:
      'Rows transform into bars that start from the fixed fire baseline of 2021-08-03 and end at the published indicative completion date when that date is usable.'
  },
  {
    step: 'today-line',
    label: 'Step 3',
    title: 'Anchor the timeline to today',
    body:
      'A vertical marker shows where the current date falls against the published horizon. This frames whether the programme schedule is still prospective or already elapsed.'
  },
  {
    step: 'status-color',
    label: 'Step 4',
    title: 'Color by timeline status',
    body:
      'Status coding distinguishes completed, past due unfinished, ongoing, and undated projects. The split between dated and undated projects is itself a key accountability signal.'
  },
  {
    step: 'funding-split',
    label: 'Step 5',
    title: 'Group by funding provenance',
    body:
      'Projects with usable end dates are grouped by public, private/philanthropic, and mixed or unclear funding provenance to reveal structural differences in reported delivery horizons.'
  }
];

export default function ReconstructionWebsiteModule({ projects, summary }: ReconstructionWebsiteModuleProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef(new Map<HorizonTimelineStep, HTMLElement>());
  const visibleRatiosRef = useRef(new Map<HorizonTimelineStep, number>());
  const [activeStep, setActiveStep] = useState<HorizonTimelineStep>('table');
  const { width: rootWidth } = useElementSize(rootRef, { width: 1200, height: 0 });

  const layoutMode = rootWidth >= 1080 ? 'split' : 'stacked';

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const stepId = entry.target.getAttribute('data-step-id') as HorizonTimelineStep | null;
          if (!stepId) {
            return;
          }

          if (entry.isIntersecting) {
            visibleRatiosRef.current.set(stepId, entry.intersectionRatio);
          } else {
            visibleRatiosRef.current.delete(stepId);
          }
        });

        if (visibleRatiosRef.current.size === 0) {
          return;
        }

        const bestStep = [...visibleRatiosRef.current.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (bestStep) {
          setActiveStep(bestStep);
        }
      },
      {
        root: null,
        rootMargin: '-20% 0px -45% 0px',
        threshold: [0.15, 0.3, 0.45, 0.6, 0.75, 1]
      }
    );

    stepRefs.current.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      visibleRatiosRef.current.clear();
    };
  }, []);

  const setStepRef = (step: HorizonTimelineStep, node: HTMLElement | null) => {
    if (node) {
      stepRefs.current.set(step, node);
      return;
    }
    stepRefs.current.delete(step);
  };

  const statusSummaryText = useMemo(() => {
    const completed = summary.timelineStatusCounts.completed;
    const pastDue = summary.timelineStatusCounts.past_due_unfinished;
    const ongoing = summary.timelineStatusCounts.ongoing;
    const undated = summary.timelineStatusCounts.undated;
    const undatedShare = summary.totalProjects > 0 ? undated / summary.totalProjects : 0;
    return `${completed} completed, ${pastDue} past due unfinished, ${ongoing} ongoing, ${undated} undated (${formatPercent(undatedShare)}).`;
  }, [summary]);

  return (
    <section ref={rootRef} aria-label="Evia reconstruction scrollytelling module">
      <div
        style={{
          borderTop: '1px solid var(--color-rule)',
          borderBottom: '1px solid var(--color-rule)',
          padding: '1rem 0',
          marginBottom: '1rem'
        }}
      >
        <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>
          Reconstruction module
        </p>
        <h1 style={{ marginBottom: '0.6rem' }}>Published horizon and programme structure</h1>
        <p style={{ marginBottom: '0.35rem' }}>
          {summary.totalProjects} listed projects, announced budget {formatEuro(summary.totalBudget)}. {statusSummaryText}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: layoutMode === 'split' ? 'minmax(0, 0.42fr) minmax(0, 0.58fr)' : 'minmax(0, 1fr)',
          gap: layoutMode === 'split' ? '1.2rem' : '1rem',
          alignItems: 'start'
        }}
      >
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {narrativeSteps.map((narrativeStep) => {
            const active = activeStep === narrativeStep.step;

            return (
              <article
                key={narrativeStep.step}
                ref={(node) => setStepRef(narrativeStep.step, node)}
                data-step-id={narrativeStep.step}
                style={{
                  border: '1px solid var(--color-rule)',
                  background: active ? 'var(--color-surface-soft)' : 'var(--color-surface)',
                  padding: '0.9rem 1rem',
                  minHeight: layoutMode === 'split' ? '62vh' : 'auto',
                  display: 'grid',
                  alignContent: 'start',
                  gap: '0.45rem'
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.72rem',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: active ? 'var(--color-text)' : 'var(--color-muted)'
                  }}
                >
                  {narrativeStep.label}
                </p>
                <h2 style={{ margin: 0, fontSize: '1.38rem', lineHeight: 1.2 }}>{narrativeStep.title}</h2>
                <p style={{ margin: 0, color: 'var(--color-muted)', maxWidth: '48ch' }}>{narrativeStep.body}</p>
              </article>
            );
          })}
        </div>

        <div
          style={{
            position: layoutMode === 'split' ? 'sticky' : 'relative',
            top: layoutMode === 'split' ? '1rem' : 'auto'
          }}
        >
          <EvoiaMetaVisualWorkspace projects={projects} step={activeStep} />
        </div>
      </div>
    </section>
  );
}
