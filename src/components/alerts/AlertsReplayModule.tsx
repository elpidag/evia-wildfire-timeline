import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProcessedAlert } from '@/lib/alerts/schema';
import type { PlaybackSpeed } from '@/lib/alerts/constants';
import { PLAYBACK_SPEEDS, TIMELINE_START } from '@/lib/alerts/constants';
import AlertsMap from './AlertsMap';
import AlertsTimeline from './AlertsTimeline';
import AlertDetailCard from './AlertDetailCard';

type AlertsReplayModuleProps = {
  alerts: ProcessedAlert[];
};

export default function AlertsReplayModule({ alerts }: AlertsReplayModuleProps) {
  const [currentTime, setCurrentTime] = useState<Date>(TIMELINE_START);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(PLAYBACK_SPEEDS[0]);
  const [selectedAlert, setSelectedAlert] = useState<ProcessedAlert | null>(null);
  const [regionFilter, setRegionFilter] = useState<string>('all');

  const urlUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read initial time from URL on mount (client-only, avoids hydration mismatch)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t');
    if (t) {
      const parsed = new Date(t);
      if (!isNaN(parsed.getTime())) setCurrentTime(parsed);
    }
  }, []);

  // Sync current time to URL (debounced, only when not playing)
  useEffect(() => {
    if (isPlaying) return;
    if (urlUpdateTimerRef.current) clearTimeout(urlUpdateTimerRef.current);
    urlUpdateTimerRef.current = setTimeout(() => {
      const iso = currentTime.toISOString().slice(0, 19);
      const url = new URL(window.location.href);
      url.searchParams.set('t', iso);
      window.history.replaceState(null, '', url.toString());
    }, 300);
    return () => {
      if (urlUpdateTimerRef.current) clearTimeout(urlUpdateTimerRef.current);
    };
  }, [currentTime, isPlaying]);

  // Region filter groups
  const ATTICA_REGIONS = ['attica_north', 'attica_west', 'attica_south'];

  const SHOWN_REGIONS = new Set([...ATTICA_REGIONS, 'evia']);

  const filteredAlerts = useMemo(() => {
    if (regionFilter === 'all') return alerts.filter((a) => SHOWN_REGIONS.has(a.fireRegion));
    if (regionFilter === 'attica') return alerts.filter((a) => ATTICA_REGIONS.includes(a.fireRegion));
    return alerts.filter((a) => a.fireRegion === regionFilter);
  }, [alerts, regionFilter]);

  // Compute current position within filtered alerts
  const rawIdx = filteredAlerts.findIndex(
    (a) => new Date(a.timestamp).getTime() > currentTime.getTime()
  );
  const resolvedArrayIndex = rawIdx === -1 ? filteredAlerts.length - 1 : Math.max(0, rawIdx - 1);
  const resolvedChronoIndex = filteredAlerts[resolvedArrayIndex]?.chronologicalIndex ?? 0;

  // Playback: step through alerts, 1 second per alert
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playIndexRef = useRef(resolvedArrayIndex);

  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current !== null) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      return;
    }

    // Start from the current position, advance every interval
    playIndexRef.current = resolvedArrayIndex;

    const intervalMs = 1000 / playbackSpeed;
    playIntervalRef.current = setInterval(() => {
      const nextIdx = playIndexRef.current + 1;
      if (nextIdx >= filteredAlerts.length) {
        setIsPlaying(false);
        return;
      }
      playIndexRef.current = nextIdx;
      const nextAlert = filteredAlerts[nextIdx];
      setCurrentTime(new Date(nextAlert.timestamp));
      setSelectedAlert(nextAlert);
    }, intervalMs);

    return () => {
      if (playIntervalRef.current !== null) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, filteredAlerts]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleTimeChange = useCallback((time: Date) => {
    setCurrentTime(time);
    setIsPlaying(false);
  }, []);

  const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
  }, []);

  const handleSelectAlert = useCallback(
    (alert: ProcessedAlert | null) => {
      setSelectedAlert(alert);
      if (alert) {
        setIsPlaying(false);
      }
    },
    []
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedAlert(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowRight': {
          e.preventDefault();
          const nextAlert = filteredAlerts[resolvedArrayIndex + 1];
          if (nextAlert) {
            setCurrentTime(new Date(nextAlert.timestamp));
            setSelectedAlert(nextAlert);
            setIsPlaying(false);
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (resolvedArrayIndex > 0) {
            const prevAlert = filteredAlerts[resolvedArrayIndex - 1];
            setCurrentTime(new Date(prevAlert.timestamp));
            setSelectedAlert(prevAlert);
            setIsPlaying(false);
          }
          break;
        }
        case 'Home':
          e.preventDefault();
          setCurrentTime(TIMELINE_START);
          setSelectedAlert(null);
          setIsPlaying(false);
          break;
        case 'End':
          e.preventDefault();
          if (filteredAlerts.length > 0) {
            const last = filteredAlerts[filteredAlerts.length - 1];
            setCurrentTime(new Date(last.timestamp));
            setSelectedAlert(last);
            setIsPlaying(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredAlerts, resolvedArrayIndex, handlePlayPause]);

  // Current date from the active alert (for burn scar layer)
  const currentAlert = filteredAlerts[resolvedArrayIndex];
  const currentDate = currentAlert ? currentAlert.timestamp.slice(0, 10) : null;

  // Alert counter display
  const alertCounter = resolvedArrayIndex >= 0
    ? `${resolvedArrayIndex + 1} / ${filteredAlerts.length}`
    : `0 / ${filteredAlerts.length}`;

  // Region filter options with counts
  const ATTICA_REGIONS_SET = new Set(ATTICA_REGIONS);
  const eviaCount = alerts.filter((a) => a.fireRegion === 'evia').length;
  const atticaCount = alerts.filter((a) => ATTICA_REGIONS_SET.has(a.fireRegion)).length;

  // Reset to start when region changes
  const handleRegionChange = useCallback((region: string) => {
    setRegionFilter(region);
    setCurrentTime(TIMELINE_START);
    setSelectedAlert(null);
    setIsPlaying(false);
  }, []);

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      {/* ── Region filter bar ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 0',
          borderTop: '1px solid var(--color-rule)',
          borderBottom: '1px solid var(--color-rule)',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'all', label: 'All', count: eviaCount + atticaCount },
            { id: 'evia', label: 'Evia', count: eviaCount },
            { id: 'attica', label: 'Attica', count: atticaCount },
          ].map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleRegionChange(id)}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.62rem',
                fontWeight: regionFilter === id ? 600 : 400,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                background: regionFilter === id ? 'var(--color-text)' : 'transparent',
                color: regionFilter === id ? '#fff' : 'var(--color-muted)',
                border: '1px solid ' + (regionFilter === id ? 'var(--color-text)' : 'var(--color-rule)'),
                padding: '3px 10px',
                cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.65rem',
            letterSpacing: '0.06em',
            color: 'var(--color-muted)',
          }}
        >
          {alertCounter}
        </div>
      </div>

      {/* ── Map + Timeline block ── */}
      <div>
        {/* Map container */}
        <div style={{ position: 'relative', height: 'calc(100vh - 16rem)', minHeight: '400px' }}>
          <AlertsMap
            alerts={filteredAlerts}
            currentIndex={resolvedChronoIndex}
            currentDate={currentDate}
            regionFilter={regionFilter}
            selectedAlert={selectedAlert}
            onSelectAlert={handleSelectAlert}
          />

          <AlertDetailCard alert={selectedAlert} onClose={handleCloseDetail} />
        </div>

        {/* Timeline scrubber */}
        <AlertsTimeline
          alerts={filteredAlerts}
          currentTime={currentTime}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          onTimeChange={handleTimeChange}
          onPlayPause={handlePlayPause}
          onSpeedChange={handleSpeedChange}
        />
      </div>

    </div>
  );
}
