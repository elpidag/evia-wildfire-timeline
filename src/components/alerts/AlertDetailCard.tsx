import type { ProcessedAlert } from '@/lib/alerts/schema';
import { ALERT_TYPE_LABELS } from '@/lib/alerts/constants';

type AlertDetailCardProps = {
  alert: ProcessedAlert | null;
  onClose: () => void;
};

const athensTimestampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Athens',
});

function formatAlertTimestamp(timestamp: string): string {
  return athensTimestampFormatter.format(new Date(timestamp));
}

export default function AlertDetailCard({ alert, onClose }: AlertDetailCardProps) {
  if (!alert) return null;

  const typeLabel = ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType;
  const isEvacuation = alert.alertType === 'evacuation';
  const hasFrom = alert.fromLocations.length > 0;
  const hasTo = alert.toLocations.length > 0;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        width: 340,
        maxWidth: 'calc(100% - 24px)',
        background: 'rgba(255, 255, 255, 0.96)',
        border: '1px solid var(--color-rule)',
        zIndex: 10,
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          height: 2,
          background: isEvacuation ? '#c74949' : '#d4a23e',
        }}
      />

      <div style={{ padding: '14px 16px 12px' }}>
        {/* Header row: timestamp + close */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--color-muted)',
                marginBottom: 3,
              }}
            >
              {formatAlertTimestamp(alert.timestamp)}
            </div>
            <span
              style={{
                display: 'inline-block',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: isEvacuation ? '#c74949' : '#d4a23e',
                fontWeight: 600,
              }}
            >
              {typeLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 22,
              height: 22,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-muted)',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            &times;
          </button>
        </div>

        {/* Alert text */}
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.84rem',
            lineHeight: 1.55,
            color: 'var(--color-text)',
            marginBottom: 10,
          }}
        >
          {alert.text.split(/(#\S+)/g).map((part, i) =>
            part.startsWith('#') ? (
              <span key={i} style={{ color: 'var(--color-text)', fontWeight: 600 }}>
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>

        {/* FROM / TO */}
        {(hasFrom || hasTo) && (
          <div
            style={{
              borderTop: '1px solid var(--color-rule)',
              paddingTop: 8,
              marginBottom: 8,
              display: 'flex',
              gap: 16,
              fontSize: '0.72rem',
              lineHeight: 1.5,
            }}
          >
            {hasFrom && (
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontSize: '0.58rem',
                    color: '#c74949',
                    marginBottom: 2,
                    fontWeight: 600,
                  }}
                >
                  From
                </div>
                <div style={{ color: 'var(--color-text)' }}>
                  {alert.fromLocations.map((l) => l.nameEn).join(', ')}
                </div>
              </div>
            )}
            {hasTo && (
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontSize: '0.58rem',
                    color: '#3a6fb5',
                    marginBottom: 2,
                    fontWeight: 600,
                  }}
                >
                  To
                </div>
                <div style={{ color: 'var(--color-text)' }}>
                  {alert.toLocations.map((l) => l.nameEn).join(', ')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer: engagement + source */}
        <div
          style={{
            borderTop: '1px solid var(--color-rule)',
            paddingTop: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.62rem',
            color: 'var(--color-muted)',
            letterSpacing: '0.04em',
          }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            <span>{alert.engagement.retweets} RT</span>
            <span>{alert.engagement.likes} Likes</span>
          </div>
          <a
            href={alert.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--color-muted)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--color-rule)',
            }}
          >
            Source
          </a>
        </div>
      </div>
    </div>
  );
}
