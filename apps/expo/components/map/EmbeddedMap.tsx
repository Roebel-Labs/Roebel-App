import React, { useMemo, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { ROEBEL_CENTER } from '@/lib/map/constants';
import { Mapbox, mapboxToken } from '@/lib/map/mapbox';

export type EmbeddedMapPoint = {
  id: string;
  lat: number;
  lon: number;
  emoji?: string;
  color?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
};

type Props = {
  points: EmbeddedMapPoint[];
  // If provided, draw a curved arc/line between first and last point (Uber Eats style)
  drawRoute?: 'arc' | 'line' | 'none';
  height?: number;
  // Padding around bounds in degrees (for zoom-to-fit)
  paddingPx?: number;
  // Whether the map is interactive (default false for mini-maps)
  interactive?: boolean;
};

// Build a curved arc between two points (Uber-Eats-style)
function buildArc(
  a: [number, number],
  b: [number, number],
  steps = 32
): GeoJSON.Feature<GeoJSON.LineString> {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  // Perpendicular offset for the control point — gives the arc its curvature
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = len * 0.25; // 25% of distance
  const cpx = cx - (dy / len) * offset;
  const cpy = cy + (dx / len) * offset;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Quadratic Bezier: B(t) = (1−t)²P0 + 2(1−t)tCP + t²P1
    const x = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cpx + t ** 2 * x2;
    const y = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cpy + t ** 2 * y2;
    coords.push([x, y]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  };
}

function pointsToGeoJSON(
  points: EmbeddedMapPoint[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        id: p.id,
        emoji: p.emoji ?? '',
        color: p.color ?? '#00498B',
        label: p.label ?? '',
        size: p.size ?? 'md',
      },
    })),
  };
}

function computeBounds(points: EmbeddedMapPoint[]): {
  ne: [number, number];
  sw: [number, number];
  center: [number, number];
} {
  if (points.length === 0) {
    return {
      ne: ROEBEL_CENTER,
      sw: ROEBEL_CENTER,
      center: ROEBEL_CENTER,
    };
  }
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  return {
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
    center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
  };
}

export default function EmbeddedMap({
  points,
  drawRoute = 'none',
  height = 220,
  paddingPx = 50,
  interactive = false,
}: Props) {
  const { isDark, colors } = useTheme();
  const cameraRef = useRef<any>(null);

  const bounds = useMemo(() => computeBounds(points), [points]);
  const pointsGeoJSON = useMemo(() => pointsToGeoJSON(points), [points]);

  const arcGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(() => {
    if (drawRoute === 'none' || points.length < 2) {
      return { type: 'FeatureCollection', features: [] };
    }
    if (drawRoute === 'arc') {
      const a: [number, number] = [points[0].lon, points[0].lat];
      const b: [number, number] = [points[points.length - 1].lon, points[points.length - 1].lat];
      return { type: 'FeatureCollection', features: [buildArc(a, b)] };
    }
    // 'line' — connect all points in order
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: points.map((p) => [p.lon, p.lat] as [number, number]),
          },
          properties: {},
        },
      ],
    };
  }, [points, drawRoute]);

  if (!Mapbox || !mapboxToken) {
    return (
      <View style={[styles.container, { height, backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          Karte nur im Dev-Client
        </Text>
      </View>
    );
  }

  // Use Outdoors style for vibrant terrain + parks. Falls back to Light/Dark if Outdoors unavailable.
  const styleURL =
    (isDark ? Mapbox.StyleURL?.Dark : Mapbox.StyleURL?.Outdoors) ||
    Mapbox.StyleURL?.Light;

  return (
    <View style={[styles.container, { height }]}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={styleURL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: bounds.center,
            zoomLevel: 12,
            bounds:
              points.length > 1
                ? {
                    ne: bounds.ne,
                    sw: bounds.sw,
                    paddingTop: paddingPx,
                    paddingBottom: paddingPx,
                    paddingLeft: paddingPx,
                    paddingRight: paddingPx,
                  }
                : undefined,
          }}
        />

        {arcGeoJSON.features.length > 0 ? (
          <Mapbox.ShapeSource id="embedded-route" shape={arcGeoJSON}>
            <Mapbox.LineLayer
              id="embedded-route-line"
              style={{
                lineColor: '#000000',
                lineWidth: 3,
                lineCap: 'round',
                lineJoin: 'round',
                lineDasharray: drawRoute === 'arc' ? [1, 0] : [1, 0],
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        <Mapbox.ShapeSource id="embedded-points" shape={pointsGeoJSON}>
          <Mapbox.CircleLayer
            id="embedded-points-bg"
            style={{
              circleRadius: [
                'match',
                ['get', 'size'],
                'sm', 8,
                'md', 12,
                'lg', 16,
                12,
              ] as any,
              circleColor: ['get', 'color'] as any,
              circleStrokeWidth: 3,
              circleStrokeColor: '#ffffff',
            }}
          />
          <Mapbox.SymbolLayer
            id="embedded-points-emoji"
            style={{
              textField: ['get', 'emoji'] as any,
              textSize: [
                'match',
                ['get', 'size'],
                'sm', 12,
                'md', 16,
                'lg', 20,
                16,
              ] as any,
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textHaloWidth: 0,
            }}
          />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  map: { flex: 1 },
});
