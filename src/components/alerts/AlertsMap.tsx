import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useRef, useState } from 'react';
import type {
  Map,
  StyleSpecification,
  ExpressionSpecification,
  GeoJSONSource,
  MapMouseEvent,
  MapGeoJSONFeature
} from 'maplibre-gl';
import type { ProcessedAlert } from '@/lib/alerts/schema';
import { MAP_CENTER, MAP_ZOOM, MAP_VIEWS, REGION_COLORS } from '@/lib/alerts/constants';


// ── Types ──

type AlertsMapProps = {
  alerts: ProcessedAlert[];
  currentIndex: number;
  currentDate: string | null;
  regionFilter: string;
  selectedAlert: ProcessedAlert | null;
  onSelectAlert: (alert: ProcessedAlert | null) => void;
};

type BasemapId = 'osm' | 'satellite';

// ── Source and layer IDs ──

const EVAC_POINTS_SOURCE = 'evac-points';
const EVAC_CURVES_SOURCE = 'evac-curves';
const EVAC_ARROWS_SOURCE = 'evac-arrows';

// Past layers (bottom)
const PAST_CURVES_LAYER = 'past-curves';
const PAST_ARROWS_LAYER = 'past-arrows';
const PAST_FROM_LAYER = 'past-from';
const PAST_TO_LAYER = 'past-to';

// Active layers (top)
const ACTIVE_CURVES_LAYER = 'active-curves';
const ACTIVE_ARROWS_LAYER = 'active-arrows';
const ACTIVE_FROM_LAYER = 'active-from';
const ACTIVE_TO_LAYER = 'active-to';

// Burn scar
const BURN_SCAR_SOURCE = 'burn-scar';
const BURN_SCAR_LAYER = 'burn-scar-fill';
const BURN_SCAR_OUTLINE_LAYER = 'burn-scar-outline';

// Only evacuation layers get chronologicalIndex filters — NOT burn scar
const EVAC_LAYERS = [
  PAST_FROM_LAYER,
  ACTIVE_CURVES_LAYER, ACTIVE_ARROWS_LAYER, ACTIVE_FROM_LAYER, ACTIVE_TO_LAYER
];

// ── Map styles ──

/** Single style with both basemaps — switch via visibility toggle, no setStyle needed */
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors'
    },
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: '&copy; Esri'
    }
  },
  layers: [
    { id: 'basemap-osm', type: 'raster', source: 'osm', paint: {}, layout: { visibility: 'none' } },
    { id: 'basemap-satellite', type: 'raster', source: 'satellite', paint: {}, layout: { visibility: 'visible' } }
  ]
};

// ── Region color match expression ──

function regionColorExpr(): ExpressionSpecification {
  const entries: (string | ExpressionSpecification)[] = ['match', ['get', 'fireRegion']];
  for (const [region, color] of Object.entries(REGION_COLORS)) {
    entries.push(region, color);
  }
  entries.push('#909090');
  return entries as unknown as ExpressionSpecification;
}

// ── Curve geometry helpers ──

function quadraticBezier(
  from: [number, number],
  to: [number, number],
  segments = 20
): [number, number][] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.0001) return [from, to];

  // Control point: perpendicular offset from midpoint (consistent curve direction)
  const offset = Math.min(dist * 0.28, 0.12);
  const mx = (from[0] + to[0]) / 2 + (dy / dist) * offset;
  const my = (from[1] + to[1]) / 2 - (dx / dist) * offset;

  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    points.push([
      u * u * from[0] + 2 * u * t * mx + t * t * to[0],
      u * u * from[1] + 2 * u * t * my + t * t * to[1]
    ]);
  }
  return points;
}

/** Compute bearing (degrees clockwise from north) at the end of a curve */
function curveEndBearing(curvePoints: [number, number][]): number {
  const n = curvePoints.length;
  if (n < 2) return 0;
  const prev = curvePoints[n - 3] ?? curvePoints[n - 2];
  const tip = curvePoints[n - 1];
  // atan2(deltaLon, deltaLat) gives bearing from north
  return (Math.atan2(tip[0] - prev[0], tip[1] - prev[1]) * 180) / Math.PI;
}

const ARROWHEAD_ICON_OSM = 'arrowhead-osm';
const ARROWHEAD_ICON_SAT = 'arrowhead-sat';
const ARROWHEAD_SIZE = 24;

/** Create arrowhead icon as ImageData for MapLibre addImage.
 *  Triangle pointing up — tip at top center, base at bottom.
 *  icon-rotate orients the tip in the bearing direction.
 *  icon-anchor 'top' places the tip at the TO coordinate.
 *  The TO marker circle renders on top, hiding the tip.
 *  The triangle body extends backward, covering the dashed line end. */
function createArrowheadImageData(color: string): { width: number; height: number; data: Uint8Array } {
  const s = ARROWHEAD_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.moveTo(s / 2, 0);              // tip — top center
  ctx.lineTo(s * 0.85, s);           // base right
  ctx.lineTo(s * 0.15, s);           // base left
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  const imageData = ctx.getImageData(0, 0, s, s);
  return { width: s, height: s, data: new Uint8Array(imageData.data.buffer) };
}

// ── GeoJSON builders ──

type PointFC = GeoJSON.FeatureCollection<GeoJSON.Point>;
type LineFC = GeoJSON.FeatureCollection<GeoJSON.LineString>;

function buildPointsGeoJSON(alerts: ProcessedAlert[], maxIndex: number): PointFC {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const seen = new Set<string>(); // dedup by coord key + role

  for (const alert of alerts) {
    if (alert.chronologicalIndex > maxIndex) continue;

    const props = {
      fireRegion: alert.fireRegion,
      chronologicalIndex: alert.chronologicalIndex,
      tweetId: alert.tweetId
    };

    if (alert.evacuationEdges.length > 0) {
      for (const edge of alert.evacuationEdges) {
        const fromKey = `from:${edge.from[0]},${edge.from[1]}:${alert.chronologicalIndex}`;
        if (!seen.has(fromKey)) {
          seen.add(fromKey);
          features.push({
            type: 'Feature',
            properties: { ...props, role: 'from' },
            geometry: { type: 'Point', coordinates: edge.from }
          });
        }

        const toKey = `to:${edge.to[0]},${edge.to[1]}:${alert.chronologicalIndex}`;
        if (!seen.has(toKey)) {
          seen.add(toKey);
          features.push({
            type: 'Feature',
            properties: { ...props, role: 'to' },
            geometry: { type: 'Point', coordinates: edge.to }
          });
        }
      }
    } else {
      // Non-evacuation alerts: show FROM locations as standalone markers
      for (const loc of alert.fromLocations) {
        const key = `from:${loc.lon},${loc.lat}:${alert.chronologicalIndex}`;
        if (!seen.has(key)) {
          seen.add(key);
          features.push({
            type: 'Feature',
            properties: { ...props, role: 'from' },
            geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] }
          });
        }
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

function buildCurvesGeoJSON(alerts: ProcessedAlert[], maxIndex: number): LineFC {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const alert of alerts) {
    if (alert.chronologicalIndex > maxIndex) continue;

    for (const edge of alert.evacuationEdges) {
      const curveCoords = quadraticBezier(edge.from, edge.to);
      features.push({
        type: 'Feature',
        properties: {
          fireRegion: alert.fireRegion,
          chronologicalIndex: alert.chronologicalIndex,
          tweetId: alert.tweetId
        },
        geometry: { type: 'LineString', coordinates: curveCoords }
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

function buildArrowheadsGeoJSON(alerts: ProcessedAlert[], maxIndex: number): PointFC {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const alert of alerts) {
    if (alert.chronologicalIndex > maxIndex) continue;

    for (const edge of alert.evacuationEdges) {
      const curveCoords = quadraticBezier(edge.from, edge.to);
      const bearing = curveEndBearing(curveCoords);

      features.push({
        type: 'Feature',
        properties: {
          fireRegion: alert.fireRegion,
          chronologicalIndex: alert.chronologicalIndex,
          bearing
        },
        geometry: { type: 'Point', coordinates: edge.to }
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

// ── Colors ──

const FROM_COLOR = '#c74949'; // red — danger/origin
const TO_COLOR = '#3a6fb5';   // blue — safe destination
const PAST_COLOR = '#aaaaaa'; // grey — past alerts
const ARROW_COLOR_OSM = '#444444';   // dark grey on light basemap
const ARROW_COLOR_SAT = '#ffffff';   // white on satellite

/** Update arrow/line colors to match the current basemap */
function applyArrowStyle(map: Map, basemap: BasemapId): void {
  const color = basemap === 'satellite' ? ARROW_COLOR_SAT : ARROW_COLOR_OSM;
  const icon = basemap === 'satellite' ? ARROWHEAD_ICON_SAT : ARROWHEAD_ICON_OSM;

  if (map.getLayer(ACTIVE_CURVES_LAYER)) {
    map.setPaintProperty(ACTIVE_CURVES_LAYER, 'line-color', color);
  }
  if (map.getLayer(ACTIVE_ARROWS_LAYER)) {
    map.setLayoutProperty(ACTIVE_ARROWS_LAYER, 'icon-image', icon);
  }
}

// ── Map layer setup ──

const PAST_FILTER: ExpressionSpecification = ['!=', ['get', 'chronologicalIndex'], -1];
const ACTIVE_FILTER: ExpressionSpecification = ['==', ['get', 'chronologicalIndex'], -1];

function ensureLayers(map: Map): void {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  // ── Burn scar (bottom-most overlay) ──
  if (!map.getSource(BURN_SCAR_SOURCE))
    map.addSource(BURN_SCAR_SOURCE, { type: 'geojson', data: empty });

  if (!map.getLayer(BURN_SCAR_LAYER))
    map.addLayer({
      id: BURN_SCAR_LAYER,
      type: 'fill',
      source: BURN_SCAR_SOURCE,
      paint: {
        'fill-color': '#ff4400',
        'fill-opacity': 0.15,
      },
    });

  if (!map.getLayer(BURN_SCAR_OUTLINE_LAYER))
    map.addLayer({
      id: BURN_SCAR_OUTLINE_LAYER,
      type: 'line',
      source: BURN_SCAR_SOURCE,
      paint: {
        'line-color': '#ff4400',
        'line-width': 1.5,
        'line-opacity': 0.5,
      },
    });

  // ── Evacuation sources ──
  if (!map.getSource(EVAC_CURVES_SOURCE))
    map.addSource(EVAC_CURVES_SOURCE, { type: 'geojson', data: empty });
  if (!map.getSource(EVAC_ARROWS_SOURCE))
    map.addSource(EVAC_ARROWS_SOURCE, { type: 'geojson', data: empty });
  if (!map.getSource(EVAC_POINTS_SOURCE))
    map.addSource(EVAC_POINTS_SOURCE, { type: 'geojson', data: empty });

  // ── Past layers (only FROM markers, grey, no curves/TO/arrows) ──

  if (!map.getLayer(PAST_FROM_LAYER))
    map.addLayer({
      id: PAST_FROM_LAYER,
      type: 'circle',
      source: EVAC_POINTS_SOURCE,
      filter: ['all', PAST_FILTER, ['==', ['get', 'role'], 'from']],
      paint: {
        'circle-radius': 4,
        'circle-color': PAST_COLOR,
        'circle-opacity': 0.7,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.6
      }
    });

  // ── Active layers ──

  // Dashed curved lines (white)
  if (!map.getLayer(ACTIVE_CURVES_LAYER))
    map.addLayer({
      id: ACTIVE_CURVES_LAYER,
      type: 'line',
      source: EVAC_CURVES_SOURCE,
      filter: ACTIVE_FILTER,
      paint: {
        'line-color': ARROW_COLOR_SAT,
        'line-width': 3,
        'line-opacity': 0.85,
        'line-dasharray': [2, 2]
      }
    });

  // Arrowheads (white triangle icons, fixed pixel size)
  if (!map.getLayer(ACTIVE_ARROWS_LAYER))
    map.addLayer({
      id: ACTIVE_ARROWS_LAYER,
      type: 'symbol',
      source: EVAC_ARROWS_SOURCE,
      filter: ACTIVE_FILTER,
      layout: {
        'icon-image': ARROWHEAD_ICON_SAT,
        'icon-size': 0.6,
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'top',
      },
      paint: {
        'icon-opacity': 0.9
      }
    });

  // FROM markers (red filled circles, no stroke)
  if (!map.getLayer(ACTIVE_FROM_LAYER))
    map.addLayer({
      id: ACTIVE_FROM_LAYER,
      type: 'circle',
      source: EVAC_POINTS_SOURCE,
      filter: ['all', ACTIVE_FILTER, ['==', ['get', 'role'], 'from']],
      paint: {
        'circle-radius': 8,
        'circle-color': FROM_COLOR
      }
    });

  // TO markers (blue filled circles, no stroke)
  if (!map.getLayer(ACTIVE_TO_LAYER))
    map.addLayer({
      id: ACTIVE_TO_LAYER,
      type: 'circle',
      source: EVAC_POINTS_SOURCE,
      filter: ['all', ACTIVE_FILTER, ['==', ['get', 'role'], 'to']],
      paint: {
        'circle-radius': 8,
        'circle-color': TO_COLOR
      }
    });
}

// ── Data updaters ──

function updateSourceData(map: Map, alerts: ProcessedAlert[], currentIndex: number): void {
  const pointsSrc = map.getSource(EVAC_POINTS_SOURCE) as GeoJSONSource | undefined;
  if (pointsSrc) pointsSrc.setData(buildPointsGeoJSON(alerts, currentIndex));

  const curvesSrc = map.getSource(EVAC_CURVES_SOURCE) as GeoJSONSource | undefined;
  if (curvesSrc) curvesSrc.setData(buildCurvesGeoJSON(alerts, currentIndex));

  const arrowsSrc = map.getSource(EVAC_ARROWS_SOURCE) as GeoJSONSource | undefined;
  if (arrowsSrc) arrowsSrc.setData(buildArrowheadsGeoJSON(alerts, currentIndex));

  // Update filters to highlight the active alert
  for (const id of EVAC_LAYERS) {
    const layer = map.getLayer(id);
    if (!layer) continue;

    const isPast = id.startsWith('past-');
    const isFrom = id.endsWith('-from');
    const isTo = id.endsWith('-to');

    let filter: ExpressionSpecification;

    if (isPast) {
      const base: ExpressionSpecification = ['<', ['get', 'chronologicalIndex'], currentIndex];
      if (isFrom) filter = ['all', base, ['==', ['get', 'role'], 'from']] as ExpressionSpecification;
      else if (isTo) filter = ['all', base, ['==', ['get', 'role'], 'to']] as ExpressionSpecification;
      else filter = base;
    } else {
      const base: ExpressionSpecification = ['==', ['get', 'chronologicalIndex'], currentIndex];
      if (isFrom) filter = ['all', base, ['==', ['get', 'role'], 'from']] as ExpressionSpecification;
      else if (isTo) filter = ['all', base, ['==', ['get', 'role'], 'to']] as ExpressionSpecification;
      else filter = base;
    }

    map.setFilter(id, filter);
  }
}

// ── Component ──

export default function AlertsMap({
  alerts,
  currentIndex,
  currentDate,
  regionFilter,
  selectedAlert,
  onSelectAlert
}: AlertsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const isReadyRef = useRef(false);

  const [mapError, setMapError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>('satellite');

  // Burn scar cache (preloaded on mount)
  const burnScarCacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());

  const onSelectAlertRef = useRef(onSelectAlert);
  onSelectAlertRef.current = onSelectAlert;

  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const currentDateRef = useRef(currentDate);
  currentDateRef.current = currentDate;

  // ── Initialization ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let cancelled = false;

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !containerRef.current) return;

      try {
        const map = new maplibregl.Map({
          container,
          style: MAP_STYLE,
          center: MAP_CENTER,
          zoom: MAP_ZOOM,
          attributionControl: false,
          keyboard: false
        });

        map.addControl(new maplibregl.AttributionControl({ compact: true }));
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', () => {
          if (!map.hasImage(ARROWHEAD_ICON_OSM)) {
            map.addImage(ARROWHEAD_ICON_OSM, createArrowheadImageData(ARROW_COLOR_OSM));
            map.addImage(ARROWHEAD_ICON_SAT, createArrowheadImageData(ARROW_COLOR_SAT));
          }
          ensureLayers(map);
          updateSourceData(map, alertsRef.current, currentIndex);
          isReadyRef.current = true;

          // Load initial burn scar
          const initDate = currentDateRef.current;
          if (initDate) {
            fetch(`/data/evia/burn-scar/cumulative/${initDate}.geojson`)
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                if (data) {
                  burnScarCacheRef.current.set(initDate, data);
                  const src = map.getSource(BURN_SCAR_SOURCE) as GeoJSONSource | undefined;
                  if (src) src.setData(data);
                }
              })
              .catch(() => {});
          }
        });

        map.on('error', (event) => {
          console.warn('MapLibre error:', event.error);
        });

        // Click handler for markers
        const handleClick = (
          e: MapMouseEvent & { features?: MapGeoJSONFeature[] }
        ) => {
          const feature = e.features?.[0];
          if (!feature || !feature.properties) return;

          const tweetId = feature.properties.tweetId as string;
          const alert = alertsRef.current.find((a) => a.tweetId === tweetId) ?? null;
          onSelectAlertRef.current(alert);
        };

        for (const id of [PAST_FROM_LAYER, PAST_TO_LAYER, ACTIVE_FROM_LAYER, ACTIVE_TO_LAYER]) {
          map.on('click', id, handleClick);
          map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
        }

        mapRef.current = map;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown MapLibre initialization error.';
        setMapError(message);
      }
    }).catch((error) => {
      if (!cancelled) {
        const message =
          error instanceof Error ? error.message : 'Failed to load map library.';
        setMapError(message);
      }
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      isReadyRef.current = false;
    };
  }, []);

  // ── Fly to region when filter changes ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) return;

    const view = MAP_VIEWS[regionFilter] ?? MAP_VIEWS.all;
    map.flyTo({ center: view.center, zoom: view.zoom, duration: 800 });
  }, [regionFilter]);

  // ── Switch basemap (visibility toggle, no setStyle) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) return;

    map.setLayoutProperty('basemap-osm', 'visibility', basemap === 'osm' ? 'visible' : 'none');
    map.setLayoutProperty('basemap-satellite', 'visibility', basemap === 'satellite' ? 'visible' : 'none');
    applyArrowStyle(map, basemap);
  }, [basemap]);

  // ── Update data on currentIndex change ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) return;

    updateSourceData(map, alerts, currentIndex);
  }, [alerts, currentIndex]);

  // ── Preload all burn scar GeoJSONs on mount ──
  useEffect(() => {
    const dates = [];
    for (let d = 3; d <= 24; d++) {
      dates.push(`2021-08-${String(d).padStart(2, '0')}`);
    }
    for (const date of dates) {
      fetch(`/data/evia/burn-scar/cumulative/${date}.geojson`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) burnScarCacheRef.current.set(date, data);
        })
        .catch(() => {});
    }
  }, []);

  // ── Update burn scar when currentDate changes ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReadyRef.current) return;

    const src = map.getSource(BURN_SCAR_SOURCE) as GeoJSONSource | undefined;
    if (!src) return;

    if (!currentDate) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const cached = burnScarCacheRef.current.get(currentDate);
    if (cached) {
      src.setData(cached);
    } else {
      // Fallback fetch if not cached yet
      fetch(`/data/evia/burn-scar/cumulative/${currentDate}.geojson`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            burnScarCacheRef.current.set(currentDate, data);
            // Re-check map is still ready and date hasn't changed
            const s = map.getSource(BURN_SCAR_SOURCE) as GeoJSONSource | undefined;
            if (s) s.setData(data);
          }
        })
        .catch(() => {});
    }
  }, [currentDate]);

  // ── Render ──
  if (mapError) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            color: 'var(--color-text, #1f2f8f)',
            fontFamily: 'var(--font-sans, sans-serif)',
            fontSize: '0.85rem'
          }}
        >
          <p>Map could not be loaded: {mapError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        aria-label="Interactive map showing 112 emergency alert locations"
      />
      {/* Basemap toggle */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'rgba(255,255,255,0.92)',
          borderRadius: '4px',
          padding: '6px 10px',
          fontFamily: 'var(--font-sans, sans-serif)',
          fontSize: '11px',
          lineHeight: '18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          zIndex: 1
        }}
      >
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="radio"
            name="basemap"
            checked={basemap === 'osm'}
            onChange={() => setBasemap('osm')}
            style={{ margin: 0 }}
          />
          OpenStreetMap
        </label>
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="radio"
            name="basemap"
            checked={basemap === 'satellite'}
            onChange={() => setBasemap('satellite')}
            style={{ margin: 0 }}
          />
          Satellite
        </label>
      </div>
    </div>
  );
}
