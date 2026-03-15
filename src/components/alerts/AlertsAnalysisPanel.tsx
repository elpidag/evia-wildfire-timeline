import { useMemo } from 'react';
import type { ProcessedAlert } from '@/lib/alerts/schema';

type AlertsAnalysisPanelProps = {
  alerts: ProcessedAlert[];
};

// ── Shared styles ──

const sectionHeader: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--color-muted)',
  paddingTop: 16,
  paddingBottom: 8,
  borderTop: '1px solid var(--color-rule)',
  marginTop: 20,
};

const cellBase: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '0.78rem',
  padding: '5px 12px 5px 0',
  verticalAlign: 'top',
  lineHeight: 1.45,
  borderBottom: '1px solid var(--color-surface-muted)',
};

const headerCell: React.CSSProperties = {
  ...cellBase,
  fontWeight: 600,
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-muted)',
  borderBottom: '1px solid var(--color-rule)',
  paddingBottom: 6,
};

const numCell: React.CSSProperties = {
  ...cellBase,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const numHeader: React.CSSProperties = {
  ...headerCell,
  textAlign: 'right',
};

// ── Helpers ──

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} Aug`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-GB');
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '\u2026';
}

// ── Section 1: Evacuation Network ──

type EvacuationDestination = {
  nameEn: string;
  count: number;
  sourceVillages: string[];
};

function computeEvacuationNetwork(alerts: ProcessedAlert[]): EvacuationDestination[] {
  const destMap = new Map<string, { count: number; sources: Set<string> }>();

  for (const alert of alerts) {
    if (alert.alertType !== 'evacuation') continue;
    if (alert.toLocations.length === 0) continue;
    const fromNames = alert.fromLocations.map((l) => l.nameEn);
    for (const toLoc of alert.toLocations) {
      const key = toLoc.nameEn;
      if (!destMap.has(key)) destMap.set(key, { count: 0, sources: new Set() });
      const entry = destMap.get(key)!;
      entry.count += 1;
      for (const name of fromNames) entry.sources.add(name);
    }
  }

  return Array.from(destMap.entries())
    .map(([nameEn, { count, sources }]) => ({
      nameEn,
      count,
      sourceVillages: Array.from(sources).sort(),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function EvacuationNetworkSection({ alerts }: { alerts: ProcessedAlert[] }) {
  const destinations = useMemo(() => computeEvacuationNetwork(alerts), [alerts]);

  if (destinations.length === 0) return null;

  return (
    <div>
      <div style={sectionHeader}>Evacuation network</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headerCell}>Destination</th>
            <th style={numHeader}>Count</th>
            <th style={headerCell}>Evacuated from</th>
          </tr>
        </thead>
        <tbody>
          {destinations.map((dest) => (
            <tr key={dest.nameEn}>
              <td style={{ ...cellBase, fontWeight: 500, whiteSpace: 'nowrap' }}>
                {dest.nameEn}
              </td>
              <td style={numCell}>{dest.count}</td>
              <td style={{ ...cellBase, color: 'var(--color-muted)', fontSize: '0.72rem' }}>
                {dest.sourceVillages.join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section 2: Engagement Summary ──

function EngagementSection({ alerts }: { alerts: ProcessedAlert[] }) {
  const stats = useMemo(() => {
    if (alerts.length === 0) return null;

    let totalEngagement = 0;
    let mostRetweeted: ProcessedAlert | null = null;
    let maxRetweets = -1;

    for (const alert of alerts) {
      const eng = alert.engagement.retweets + alert.engagement.likes;
      totalEngagement += eng;
      if (alert.engagement.retweets > maxRetweets) {
        maxRetweets = alert.engagement.retweets;
        mostRetweeted = alert;
      }
    }

    return {
      totalEngagement,
      avgEngagement: totalEngagement / alerts.length,
      mostRetweeted,
      maxRetweets,
      totalAlerts: alerts.length,
    };
  }, [alerts]);

  if (!stats || !stats.mostRetweeted) return null;

  const metricStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: '0.78rem',
    lineHeight: 1.6,
    color: 'var(--color-text)',
    margin: '0 0 4px',
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--color-muted)',
    fontSize: '0.72rem',
  };

  return (
    <div>
      <div style={sectionHeader}>Engagement</div>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', lineHeight: 1, color: 'var(--color-text)' }}>
            {formatNumber(stats.totalEngagement)}
          </div>
          <div style={{ ...labelStyle, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>
            Total engagement
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', lineHeight: 1, color: 'var(--color-text)' }}>
            {Math.round(stats.avgEngagement).toLocaleString('en-GB')}
          </div>
          <div style={{ ...labelStyle, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>
            Per alert average
          </div>
        </div>
      </div>
      <p style={metricStyle}>
        <span style={labelStyle}>Most retweeted: </span>
        <em>&ldquo;{truncateText(stats.mostRetweeted.text, 100)}&rdquo;</em>
        {' '}&mdash;{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(stats.maxRetweets)} RT</strong>
        {' '}
        <span style={labelStyle}>({formatDateShort(stats.mostRetweeted.timestamp)})</span>
      </p>
    </div>
  );
}

// ── Main Panel ──

export default function AlertsAnalysisPanel({ alerts }: AlertsAnalysisPanelProps) {
  return (
    <div style={{ paddingBottom: 32 }}>
      <EvacuationNetworkSection alerts={alerts} />
      <EngagementSection alerts={alerts} />
    </div>
  );
}
