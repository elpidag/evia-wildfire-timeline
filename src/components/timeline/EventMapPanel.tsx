import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type LngLatBoundsLike, type Map } from 'maplibre-gl';
import type { TimelineEvent } from '@/lib/timeline/types';

type EventMapPanelProps = {
  selectedEvent: TimelineEvent | null;
  events: TimelineEvent[];
};

type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
type CoordinateBounds = [[number, number], [number, number]];

const contextSourceId = 'filtered-events-source';
const contextFillLayerId = 'filtered-events-fill';
const contextLineLayerId = 'filtered-events-line';
const contextCircleLayerId = 'filtered-events-circle';

const selectedSourceId = 'selected-event-source';
const selectedFillLayerId = 'selected-event-fill';
const selectedLineLayerId = 'selected-event-line';
const selectedCircleLayerId = 'selected-event-circle';

const subduedStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }
  },
  layers: [
    {
      id: 'base',
      type: 'raster',
      source: 'base',
      paint: {
        'raster-opacity': 0.92,
        'raster-saturation': -0.65,
        'raster-contrast': -0.1
      }
    }
  ]
};

function getMotionDuration(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
}

function extractCoordinatePairs(input: unknown, acc: [number, number][]): void {
  if (!Array.isArray(input)) {
    return;
  }

  if (
    input.length === 2 &&
    typeof input[0] === 'number' &&
    typeof input[1] === 'number' &&
    Number.isFinite(input[0]) &&
    Number.isFinite(input[1])
  ) {
    acc.push([input[0], input[1]]);
    return;
  }

  for (const item of input) {
    extractCoordinatePairs(item, acc);
  }
}

function getGeometryBounds(geometry: TimelineEvent['geometry']): CoordinateBounds | null {
  if (!geometry) {
    return null;
  }

  const coordinates: [number, number][] = [];
  extractCoordinatePairs(geometry.coordinates, coordinates);

  if (coordinates.length === 0) {
    return null;
  }

  let minLon = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLon = coordinates[0][0];
  let maxLat = coordinates[0][1];

  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat]
  ];
}

function toFeatureCollection(events: TimelineEvent[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events
      .filter((event) => Boolean(event.geometry))
      .map((event) => ({
        type: 'Feature',
        id: event.id,
        properties: {
          id: event.id,
          title: event.title
        },
        geometry: event.geometry as GeoJSON.Geometry
      }))
  };
}

function ensureMapLayers(map: Map): void {
  if (!map.getSource(contextSourceId)) {
    map.addSource(contextSourceId, {
      type: 'geojson',
      data: toFeatureCollection([])
    });
  }

  if (!map.getLayer(contextFillLayerId)) {
    map.addLayer({
      id: contextFillLayerId,
      type: 'fill',
      source: contextSourceId,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': '#9ca4b4',
        'fill-opacity': 0.14
      }
    });
  }

  if (!map.getLayer(contextLineLayerId)) {
    map.addLayer({
      id: contextLineLayerId,
      type: 'line',
      source: contextSourceId,
      paint: {
        'line-color': '#7c849d',
        'line-width': 1
      }
    });
  }

  if (!map.getLayer(contextCircleLayerId)) {
    map.addLayer({
      id: contextCircleLayerId,
      type: 'circle',
      source: contextSourceId,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 4,
        'circle-color': '#7c849d',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff'
      }
    });
  }

  if (!map.getSource(selectedSourceId)) {
    map.addSource(selectedSourceId, {
      type: 'geojson',
      data: toFeatureCollection([])
    });
  }

  if (!map.getLayer(selectedFillLayerId)) {
    map.addLayer({
      id: selectedFillLayerId,
      type: 'fill',
      source: selectedSourceId,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': '#c74949',
        'fill-opacity': 0.22
      }
    });
  }

  if (!map.getLayer(selectedLineLayerId)) {
    map.addLayer({
      id: selectedLineLayerId,
      type: 'line',
      source: selectedSourceId,
      paint: {
        'line-color': '#a73f40',
        'line-width': 2.2
      }
    });
  }

  if (!map.getLayer(selectedCircleLayerId)) {
    map.addLayer({
      id: selectedCircleLayerId,
      type: 'circle',
      source: selectedSourceId,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 6,
        'circle-color': '#c74949',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#1f2f8f'
      }
    });
  }
}

function applyContextData(map: Map, events: TimelineEvent[]): void {
  const source = map.getSource(contextSourceId) as maplibregl.GeoJSONSource | undefined;
  if (!source) {
    return;
  }

  source.setData(toFeatureCollection(events));
}

function applySelectedData(map: Map, selectedEvent: TimelineEvent | null): void {
  const source = map.getSource(selectedSourceId) as maplibregl.GeoJSONSource | undefined;
  if (!source) {
    return;
  }

  source.setData(selectedEvent ? toFeatureCollection([selectedEvent]) : toFeatureCollection([]));
}

function getFallbackViewport(events: TimelineEvent[]): { center: [number, number]; zoom: number } {
  for (const event of events) {
    if (event.mapViewport) {
      return {
        center: event.mapViewport.center,
        zoom: event.mapViewport.zoom
      };
    }
  }

  return {
    center: [23.6, 38.62],
    zoom: 6.8
  };
}

function getBoundsForEvents(events: TimelineEvent[]): LngLatBoundsLike | null {
  let combinedBounds: maplibregl.LngLatBounds | null = null;

  for (const event of events) {
    const bounds = getGeometryBounds(event.geometry);
    if (!bounds) {
      continue;
    }

    const current = new maplibregl.LngLatBounds(bounds[0], bounds[1]);
    if (!combinedBounds) {
      combinedBounds = current;
    } else {
      combinedBounds.extend(current.getSouthWest());
      combinedBounds.extend(current.getNorthEast());
    }
  }

  if (!combinedBounds) {
    return null;
  }

  return [
    [combinedBounds.getWest(), combinedBounds.getSouth()],
    [combinedBounds.getEast(), combinedBounds.getNorth()]
  ];
}

function applyViewport(
  map: Map,
  selectedEvent: TimelineEvent | null,
  events: TimelineEvent[],
  fallbackViewport: { center: [number, number]; zoom: number }
): void {
  const duration = getMotionDuration();

  if (selectedEvent) {
    const geometryBounds = getGeometryBounds(selectedEvent.geometry);
    if (geometryBounds) {
      map.fitBounds(geometryBounds, {
        padding: 40,
        duration,
        maxZoom: 10
      });
      return;
    }

    if (selectedEvent.mapViewport) {
      map.easeTo({
        center: selectedEvent.mapViewport.center,
        zoom: selectedEvent.mapViewport.zoom,
        duration
      });
      return;
    }
  }

  const eventBounds = getBoundsForEvents(events);
  if (eventBounds) {
    map.fitBounds(eventBounds, {
      padding: 40,
      duration,
      maxZoom: 9
    });
    return;
  }

  map.easeTo({
    center: fallbackViewport.center,
    zoom: fallbackViewport.zoom,
    duration
  });
}

export default function EventMapPanel({ selectedEvent, events }: EventMapPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const fallbackViewport = useMemo(() => getFallbackViewport(events), [events]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    try {
      const map = new maplibregl.Map({
        container,
        style: subduedStyle,
        center: fallbackViewport.center,
        zoom: fallbackViewport.zoom,
        attributionControl: false
      });

      map.addControl(new maplibregl.AttributionControl({ compact: true }));
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        ensureMapLayers(map);
        applyContextData(map, events);
        applySelectedData(map, selectedEvent);
        applyViewport(map, selectedEvent, events, fallbackViewport);
        setIsReady(true);
      });

      map.on('error', (event) => {
        const message = event.error instanceof Error ? event.error.message : 'Map rendering error.';
        setMapError(message);
      });

      mapRef.current = map;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown MapLibre initialization error.';
      setMapError(message);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) {
      return;
    }

    applyContextData(map, events);
    applySelectedData(map, selectedEvent);
    applyViewport(map, selectedEvent, events, fallbackViewport);
  }, [events, fallbackViewport, isReady, selectedEvent]);

  return (
    <section className="map-panel" aria-label="Map panel">
      <header className="map-panel-header">
        <p className="detail-eyebrow">Map</p>
        <h2>Spatial annotation</h2>
        <p>
          {selectedEvent
            ? `Focused on: ${selectedEvent.title}`
            : events.length > 0
              ? `Overview of ${events.length} visible events.`
              : 'No visible events in the current filter state.'}
        </p>
      </header>

      {mapError ? <p className="map-error">{mapError}</p> : null}

      <div
        ref={containerRef}
        className="map-canvas"
        tabIndex={0}
        aria-label="Interactive map showing selected and filtered event geometry"
      />
    </section>
  );
}
