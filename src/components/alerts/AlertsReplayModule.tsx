import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProcessedAlert, AlertsSummary } from '@/lib/alerts/schema';
import type { PlaybackSpeed } from '@/lib/alerts/constants';
import { PLAYBACK_SPEEDS, TIMELINE_START } from '@/lib/alerts/constants';
import AlertsMap from './AlertsMap';
import AlertsTimeline from './AlertsTimeline';
import AlertDetailCard from './AlertDetailCard';
import AlertsFrequencyChart from './AlertsFrequencyChart';
import AlertsAnalysisPanel from './AlertsAnalysisPanel';

type AlertsReplayModuleProps = {
  alerts: ProcessedAlert[];
  summary: AlertsSummary;
};

export default function AlertsReplayModule({ alerts, summary }: AlertsReplayModuleProps) {
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

  // Compute current position: array index of the most recent alert at currentTime
  const rawIdx = alerts.findIndex(
    (a) => new Date(a.timestamp).getTime() > currentTime.getTime()
  );
  const resolvedArrayIndex = rawIdx === -1 ? alerts.length - 1 : Math.max(0, rawIdx - 1);
  // The actual chronologicalIndex property (for map filters)
  const resolvedChronoIndex = alerts[resolvedArrayIndex]?.chronologicalIndex ?? 0;

  // Filter alerts by region
  const filteredAlerts =
    regionFilter === 'all' ? alerts : alerts.filter((a) => a.fireRegion === regionFilter);

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

    // Start from the current position
    playIndexRef.current = resolvedArrayIndex;

    // Step to next alert immediately, then every 1 second
    const step = () => {
      const nextIdx = playIndexRef.current + 1;
      if (nextIdx >= alerts.length) {
        setIsPlaying(false);
        return;
      }
      playIndexRef.current = nextIdx;
      const nextAlert = alerts[nextIdx];
      setCurrentTime(new Date(nextAlert.timestamp));
      setSelectedAlert(nextAlert);
    };

    step(); // first step immediately
    const intervalMs = 1000 / playbackSpeed;
    playIntervalRef.current = setInterval(step, intervalMs);

    return () => {
      if (playIntervalRef.current !== null) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, alerts]);

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
          const nextAlert = alerts[resolvedArrayIndex + 1];
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
            const prevAlert = alerts[resolvedArrayIndex - 1];
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
          if (alerts.length > 0) {
            const last = alerts[alerts.length - 1];
            setCurrentTime(new Date(last.timestamp));
            setSelectedAlert(last);
            setIsPlaying(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alerts, resolvedArrayIndex, handlePlayPause]);

  const availableRegions = Array.from(new Set(alerts.map((a) => a.fireRegion))).sort();

  // Alert counter display
  const alertCounter = resolvedArrayIndex >= 0
    ? `${resolvedArrayIndex + 1} / ${alerts.length}`
    : `0 / ${alerts.length}`;

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      {/* ── Map + Timeline block ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 12rem)',
          minHeight: '28rem',
          borderTop: '1px solid var(--color-rule)',
        }}
      >
        {/* Map container */}
        <div style={{ position: 'relative', flex: 1, minHeight: '300px' }}>
          <AlertsMap
            alerts={filteredAlerts}
            currentIndex={resolvedChronoIndex}
            selectedAlert={selectedAlert}
            onSelectAlert={handleSelectAlert}
          />

          {/* Alert counter overlay — top left, below basemap toggle */}
          <div
            style={{
              position: 'absolute',
              top: 58,
              left: 8,
              background: 'rgba(31, 47, 143, 0.88)',
              color: '#fff',
              fontFamily: 'var(--font-display)',
              fontSize: '0.8rem',
              letterSpacing: '0.08em',
              padding: '3px 10px',
              borderRadius: '2px',
              zIndex: 1,
            }}
          >
            {alertCounter}
          </div>

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

      {/* ── Analysis sections ── */}
      <div style={{ marginTop: '2rem' }}>
        <AlertsFrequencyChart alerts={filteredAlerts} />
        <AlertsAnalysisPanel alerts={filteredAlerts} />
      </div>
    </div>
  );
}
