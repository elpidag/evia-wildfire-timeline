import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Map,
  StyleSpecification,
  GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MAP_CENTER,
  MAP_ZOOM,
  FIRE_DATES,
  FIRE_START,
  SOURCE_COLORS,
  SOURCE_LABELS,
} from '@/lib/fire-reconstruction/constants';

// ── Types ──

type GibsLayerId = 'falseColor' | 'trueColor';

interface FireDetection {
  source: string;
  acq_date: string;
  timestamp_utc: string;
  frp: number;
  confidence: string;
}

// ── Local GIBS tile paths ──
// Pre-downloaded tiles served from /data/evia/gibs/{folder}/{date}/{z}/{y}/{x}.jpg
// Falls back to live GIBS if local tile not found.

const MODIS_ONLY_DATES = new Set(['2021-08-04']);

function localTileFolder(gibsLayer: GibsLayerId, date: string): string {
  if (MODIS_ONLY_DATES.has(date)) {
    return gibsLayer === 'trueColor' ? 'modis-tc' : 'modis-fc';
  }
  return gibsLayer === 'trueColor' ? 'viirs-tc' : 'viirs-fc';
}

function localTileUrl(gibsLayer: GibsLayerId, date: string): string {
  const folder = localTileFolder(gibsLayer, date);
  return `/data/evia/gibs/${folder}/${date}/{z}/{y}/{x}.jpg`;
}

// ── Map style ──
// All dates for current layer type are added as sources upfront.
// Only one is visible at a time — switching dates just toggles visibility.
// No source removal = instant transitions.

function buildStyle(initialDate: string, gibsLayer: GibsLayerId): StyleSpecification {
  const sources: Record<string, any> = {};
  const layers: any[] = [];

  for (const date of FIRE_DATES) {
    const srcId = `gibs-${date}`;
    sources[srcId] = {
      type: 'raster',
      tiles: [localTileUrl(gibsLayer, date)],
      tileSize: 256,
      attribution: 'NASA GIBS',
      maxzoom: 9,
    };
    layers.push({
      id: `gibs-layer-${date}`,
      type: 'raster',
      source: srcId,
      layout: { visibility: date === initialDate ? 'visible' : 'none' },
      paint: { 'raster-fade-duration': 0 },
    });
  }

  return { version: 8, sources, layers };
}

// ── Source / layer IDs ──

const FIRES_SOURCE = 'active-fires';
const FIRES_LAYER = 'fire-points';
const BURN_SCAR_SOURCE = 'burn-scar';
const BURN_SCAR_LAYER = 'burn-scar-fill';
const BURN_SCAR_OUTLINE_LAYER = 'burn-scar-outline';

// ── Component ──

export default function EviaFireMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const isReadyRef = useRef(false);

  const [selectedDate, setSelectedDate] = useState(FIRE_START);
  const [dateIndex, setDateIndex] = useState(0);
  const [gibsLayer, setGibsLayer] = useState<GibsLayerId>('falseColor');
  const [showFires, setShowFires] = useState(true);
  const [showBurnScar, setShowBurnScar] = useState(true);
  const [cumulative, setCumulative] = useState(true);
  const [visibleSources, setVisibleSources] = useState<Record<string, boolean>>({
    MODIS_SP: true,
    VIIRS_SNPP_SP: true,
    VIIRS_NOAA20_SP: true,
  });
  const [fireData, setFireData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [burnScarData, setBurnScarData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load fire data
  useEffect(() => {
    fetch('/data/evia/active-fires.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        console.log(`[fire-map] Loaded ${data.features.length} fire detections`);
        setFireData(data);
      })
      .catch(err => {
        console.warn('[fire-map] No fire data yet:', err.message);
      });
  }, []);

  // Preload all burn scar GeoJSONs into cache on mount
  const burnScarCacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());

  useEffect(() => {
    // Preload all dates in parallel
    for (const date of FIRE_DATES) {
      fetch(`/data/evia/burn-scar/cumulative/${date}.geojson`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) burnScarCacheRef.current.set(date, data);
        })
        .catch(() => {});
    }
  }, []);

  // Set burn scar from cache when date changes
  useEffect(() => {
    if (!showBurnScar) {
      setBurnScarData(null);
      return;
    }
    const cached = burnScarCacheRef.current.get(selectedDate);
    if (cached) {
      setBurnScarData(cached);
    } else {
      // Fallback: fetch if not cached yet
      fetch(`/data/evia/burn-scar/cumulative/${selectedDate}.geojson`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            burnScarCacheRef.current.set(selectedDate, data);
            setBurnScarData(data);
          } else {
            setBurnScarData(null);
          }
        })
        .catch(() => setBurnScarData(null));
    }
  }, [selectedDate, showBurnScar]);

  // Filter fires by selected date and source toggles
  const filteredFires = useMemo(() => {
    if (!fireData) return { type: 'FeatureCollection' as const, features: [] };

    const filtered = fireData.features.filter(f => {
      const d = f.properties?.acq_date;
      const src = f.properties?.source;
      if (!visibleSources[src]) return false;
      if (cumulative) return d <= selectedDate;
      return d === selectedDate;
    });

    return { type: 'FeatureCollection' as const, features: filtered };
  }, [fireData, selectedDate, cumulative, visibleSources]);

  // Date slider handler
  const handleDateChange = useCallback((index: number) => {
    setDateIndex(index);
    setSelectedDate(FIRE_DATES[index]);
  }, []);

  // Playback
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      return;
    }

    playIntervalRef.current = setInterval(() => {
      setDateIndex(prev => {
        const next = prev + 1;
        if (next >= FIRE_DATES.length) {
          setIsPlaying(false);
          return prev;
        }
        setSelectedDate(FIRE_DATES[next]);
        return next;
      });
    }, 1500);

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying]);

  // Initialize map
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let cancelled = false;

    import('maplibre-gl').then(maplibregl => {
      if (cancelled || !containerRef.current) return;

      try {
        const map = new maplibregl.Map({
          container,
          style: buildStyle(selectedDate, gibsLayer),
          center: MAP_CENTER,
          zoom: MAP_ZOOM,
          attributionControl: false,
          maxZoom: 12,
        });

        map.addControl(new maplibregl.AttributionControl({ compact: true }));
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

        map.on('load', () => {
          // Burn scar source + layers (rendered below fires)
          map.addSource(BURN_SCAR_SOURCE, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.addLayer({
            id: BURN_SCAR_LAYER,
            type: 'fill',
            source: BURN_SCAR_SOURCE,
            paint: {
              'fill-color': '#ff4400',
              'fill-opacity': 0.15,
            },
          });

          map.addLayer({
            id: BURN_SCAR_OUTLINE_LAYER,
            type: 'line',
            source: BURN_SCAR_SOURCE,
            paint: {
              'line-color': '#ff4400',
              'line-width': 1.5,
              'line-opacity': 0.7,
            },
          });

          // Fire detections source + layer
          map.addSource(FIRES_SOURCE, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.addLayer({
            id: FIRES_LAYER,
            type: 'circle',
            source: FIRES_SOURCE,
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['get', 'frp'],
                0, 3,
                10, 5,
                50, 8,
                200, 14,
              ],
              'circle-color': [
                'match', ['get', 'source'],
                'MODIS_SP', SOURCE_COLORS.MODIS_SP,
                'VIIRS_SNPP_SP', SOURCE_COLORS.VIIRS_SNPP_SP,
                'VIIRS_NOAA20_SP', SOURCE_COLORS.VIIRS_NOAA20_SP,
                '#ff4444',
              ],
              'circle-opacity': 0.75,
              'circle-stroke-width': 0.5,
              'circle-stroke-color': 'rgba(0,0,0,0.3)',
            },
          });

          isReadyRef.current = true;
          mapRef.current = map;
        });

        map.on('error', e => console.warn('Map error:', e.error));

        // Tooltip on hover
        map.on('mouseenter', FIRES_LAYER, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', FIRES_LAYER, () => {
          map.getCanvas().style.cursor = '';
        });

        mapRef.current = map;
      } catch (err) {
        setMapError(err instanceof Error ? err.message : 'Map init failed');
      }
    }).catch(err => {
      if (!cancelled) setMapError(err instanceof Error ? err.message : 'Failed to load map');
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      isReadyRef.current = false;
    };
  }, []);

  // Track previous date for visibility toggling
  const prevDateRef = useRef(selectedDate);
  const gibsLayerRef = useRef(gibsLayer);

  // Switch date: instant visibility toggle (no source changes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) return;

    const prev = prevDateRef.current;
    if (prev !== selectedDate) {
      const prevLayer = `gibs-layer-${prev}`;
      const nextLayer = `gibs-layer-${selectedDate}`;
      if (map.getLayer(prevLayer)) map.setLayoutProperty(prevLayer, 'visibility', 'none');
      if (map.getLayer(nextLayer)) map.setLayoutProperty(nextLayer, 'visibility', 'visible');
      prevDateRef.current = selectedDate;
    }
  }, [selectedDate]);

  // Switch imagery type (true/false color): rebuild all GIBS sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) return;
    if (gibsLayer === gibsLayerRef.current) return;
    gibsLayerRef.current = gibsLayer;

    // Remove old GIBS layers and sources
    for (const date of FIRE_DATES) {
      const layerId = `gibs-layer-${date}`;
      const srcId = `gibs-${date}`;
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    }

    // Add new ones with updated tile URLs
    const firstOverlay = BURN_SCAR_LAYER;
    for (const date of FIRE_DATES) {
      const srcId = `gibs-${date}`;
      map.addSource(srcId, {
        type: 'raster',
        tiles: [localTileUrl(gibsLayer, date)],
        tileSize: 256,
        maxzoom: 9,
      });
      map.addLayer({
        id: `gibs-layer-${date}`,
        type: 'raster',
        source: srcId,
        layout: { visibility: date === selectedDate ? 'visible' : 'none' },
        paint: { 'raster-fade-duration': 0 },
      }, firstOverlay);
    }
  }, [gibsLayer]);

  // Update fire data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) return;

    const src = map.getSource(FIRES_SOURCE) as GeoJSONSource | undefined;
    if (src) {
      src.setData(showFires ? filteredFires : { type: 'FeatureCollection', features: [] });
    }
  }, [filteredFires, showFires]);

  // Update burn scar data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) return;

    const src = map.getSource(BURN_SCAR_SOURCE) as GeoJSONSource | undefined;
    if (src) {
      src.setData(burnScarData ?? { type: 'FeatureCollection', features: [] });
    }
  }, [burnScarData]);

  // Stats
  const fireCount = filteredFires.features.length;
  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  if (mapError) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)' }}>
        <p>Map could not be loaded: {mapError}</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Map */}
      <div style={{ position: 'relative', height: 'calc(100vh - 14rem)', minHeight: '400px' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* Layer toggles — top left */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'rgba(255,255,255,0.94)',
            borderRadius: 3,
            padding: '8px 12px',
            fontSize: '0.65rem',
            lineHeight: '20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 2 }}>
            Imagery
          </div>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="radio" name="gibs" checked={gibsLayer === 'falseColor'} onChange={() => setGibsLayer('falseColor')} style={{ margin: 0 }} />
            False Color (M11-I2-I1)
          </label>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="radio" name="gibs" checked={gibsLayer === 'trueColor'} onChange={() => setGibsLayer('trueColor')} style={{ margin: 0 }} />
            True Color
          </label>

          <div style={{ borderTop: '1px solid #e0e0e0', marginTop: 4, paddingTop: 4 }}>
            <div style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 2 }}>
              Detections
            </div>
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <label key={key} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                <input
                  type="checkbox"
                  checked={showFires && visibleSources[key]}
                  onChange={e => {
                    if (!showFires) setShowFires(true);
                    setVisibleSources(prev => ({ ...prev, [key]: e.target.checked }));
                  }}
                  style={{ margin: 0 }}
                />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: SOURCE_COLORS[key], display: 'inline-block', flexShrink: 0 }} />
                {label}
              </label>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #e0e0e0', marginTop: 4, paddingTop: 4 }}>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="checkbox" checked={showBurnScar} onChange={e => setShowBurnScar(e.target.checked)} style={{ margin: 0 }} />
              Burn Scar (VNP64A1)
            </label>
          </div>

          <div style={{ borderTop: '1px solid #e0e0e0', marginTop: 4, paddingTop: 4 }}>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="radio" name="mode" checked={cumulative} onChange={() => setCumulative(true)} style={{ margin: 0 }} />
              Cumulative
            </label>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="radio" name="mode" checked={!cumulative} onChange={() => setCumulative(false)} style={{ margin: 0 }} />
              Day only
            </label>
          </div>
        </div>

        {/* Legend — bottom left */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            background: 'rgba(255,255,255,0.94)',
            borderRadius: 3,
            padding: '8px 12px',
            fontSize: '0.6rem',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            zIndex: 1,
          }}
        >
          <div style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4 }}>
            Active Fire Detections
          </div>
          {Object.entries(SOURCE_LABELS).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: SOURCE_COLORS[key], display: 'inline-block', flexShrink: 0 }} />
              <span>{label}</span>
            </div>
          ))}
          <div style={{ marginTop: 4, color: '#888', fontSize: '0.55rem' }}>
            Size = Fire Radiative Power (FRP)
          </div>

          <div style={{ borderTop: '1px solid #e0e0e0', marginTop: 6, paddingTop: 6 }}>
            <div style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4 }}>
              Burn Scar (VNP64A1)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: 'rgba(255,68,0,0.15)', border: '1px solid rgba(255,68,0,0.7)', display: 'inline-block', flexShrink: 0 }} />
              <span>Daily cumulative (Burn Date)</span>
            </div>
          </div>
        </div>

        {/* Date + count overlay — top right area */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 48,
            background: 'rgba(31, 47, 143, 0.88)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 2,
            zIndex: 1,
            fontFamily: 'var(--font-display)',
            fontSize: '0.85rem',
            letterSpacing: '0.06em',
          }}
        >
          {dateLabel} &mdash; {fireCount} detections
        </div>
      </div>

      {/* Timeline controls */}
      <div
        style={{
          background: 'var(--color-surface, #fff)',
          borderTop: '1px solid var(--color-rule)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setIsPlaying(p => !p)}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            background: isPlaying ? 'rgba(199,73,73,0.15)' : 'var(--color-surface-soft)',
            border: 'none',
            color: isPlaying ? '#c74949' : 'var(--color-text)',
            cursor: 'pointer',
            padding: '4px 12px',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        <input
          type="range"
          min={0}
          max={FIRE_DATES.length - 1}
          value={dateIndex}
          onChange={e => handleDateChange(parseInt(e.target.value))}
          style={{ flex: 1, cursor: 'pointer' }}
        />

        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.68rem',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-muted)',
            whiteSpace: 'nowrap',
            minWidth: 90,
            textAlign: 'right',
          }}
        >
          {selectedDate}
        </div>
      </div>

      {/* Methodology note */}
      <div
        style={{
          borderTop: '1px solid var(--color-rule)',
          padding: '8px 16px',
          fontSize: '0.58rem',
          color: 'var(--color-muted)',
          lineHeight: 1.5,
        }}
      >
        <strong>Data sources:</strong> Active-fire detections from NASA FIRMS
        (MODIS, VIIRS/Suomi NPP, VIIRS/NOAA-20) Standard Processing historical datasets.
        Daily cumulative burn scar derived from VNP64A1 V002 Burn Date product (500m resolution).
        Satellite imagery from NASA GIBS VIIRS Corrected Reflectance.
        Fire detections are individual satellite observations, not fire perimeters.
        Burn scar grows by day, not by hour.
      </div>
    </div>
  );
}
