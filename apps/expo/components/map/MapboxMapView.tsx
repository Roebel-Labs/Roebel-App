import React, { useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  ROEBEL_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  CLUSTER_RADIUS,
  CLUSTER_MAX_ZOOM,
  CATEGORY_COLORS,
  DEFAULT_MARKER_COLOR,
  ENTITY_TYPE_COLORS,
} from '@/lib/map/constants';
import type { MapGeoJSON } from '@/lib/map/geojson';
import type { MapEntityType } from '@/lib/types';

// Try to load Mapbox — fails gracefully in Expo Go
let Mapbox: any = null;
try {
  Mapbox = require('@rnmapbox/maps').default;
} catch {
  // Native module not available (Expo Go)
}

type Props = {
  geojson: MapGeoJSON;
  onMarkerPress: (id: string, entityType: MapEntityType) => void;
  flyToCoordinate?: [number, number] | null; // [lng, lat]
};

// Build a Mapbox match expression for event category → color
const categoryColorExpression: any = [
  'match',
  ['get', 'category'],
  ...Object.entries(CATEGORY_COLORS).flatMap(([cat, color]) => [cat, color]),
  DEFAULT_MARKER_COLOR,
];

export default function MapboxMapView({ geojson, onMarkerPress, flyToCoordinate }: Props) {
  const { isDark } = useTheme();
  const cameraRef = useRef<any>(null);

  const styleURL = Mapbox ? (isDark ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light) : '';

  // Fly to a specific coordinate when it changes
  React.useEffect(() => {
    if (flyToCoordinate && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: flyToCoordinate,
        zoomLevel: 15,
        animationDuration: 1000,
        animationMode: 'flyTo',
      });
    }
  }, [flyToCoordinate]);

  const handleShapePress = useCallback(
    (e: any) => {
      const feature = e.features?.[0];
      if (!feature) return;

      // Handle cluster tap — zoom in to expand
      if (feature.properties?.cluster) {
        const coords = feature.geometry?.coordinates;
        if (coords && cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: coords,
            zoomLevel: (feature.properties.expansionZoom || 14) + 1,
            animationDuration: 500,
            animationMode: 'flyTo',
          });
        }
        return;
      }

      // Handle individual marker tap
      const id = feature.properties?.id;
      const entityType = feature.properties?.entityType as MapEntityType | undefined;
      if (id && entityType) {
        onMarkerPress(id, entityType);
      }
    },
    [onMarkerPress]
  );

  const clusterCircleStyle = useMemo(
    () => ({
      circleColor: '#194383',
      circleRadius: [
        'step',
        ['get', 'point_count'],
        20, // default radius
        10,
        25, // >= 10 points
        50,
        30, // >= 50 points
      ] as any,
      circleOpacity: 0.85,
      circleStrokeWidth: 2,
      circleStrokeColor: '#ffffff',
    }),
    []
  );

  const clusterCountStyle = useMemo(
    () => ({
      textField: [
        'format',
        ['get', 'point_count_abbreviated'],
        {},
      ] as any,
      textSize: 14,
      textColor: '#ffffff',
      textFont: ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      textAllowOverlap: true,
    }),
    []
  );

  // Entity-type-aware marker colors:
  // restaurant → orange, business → green, event → category-based colors
  const markerCircleStyle = useMemo(
    () => ({
      circleRadius: 12,
      circleColor: [
        'case',
        ['==', ['get', 'entityType'], 'restaurant'],
        ENTITY_TYPE_COLORS.restaurant,
        ['==', ['get', 'entityType'], 'business'],
        ENTITY_TYPE_COLORS.business,
        categoryColorExpression,
      ] as any,
      circleStrokeWidth: 3,
      circleStrokeColor: '#ffffff',
      circleSortKey: 1,
    }),
    []
  );

  // If Mapbox isn't available (Expo Go), render nothing — parent shows fallback
  if (!Mapbox) return null;

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={styleURL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: ROEBEL_CENTER,
            zoomLevel: DEFAULT_ZOOM,
          }}
          minZoomLevel={MIN_ZOOM}
          maxZoomLevel={MAX_ZOOM}
          animationMode="flyTo"
          animationDuration={1000}
        />

        <Mapbox.ShapeSource
          id="map-entities-source"
          shape={geojson}
          cluster
          clusterRadius={CLUSTER_RADIUS}
          clusterMaxZoomLevel={CLUSTER_MAX_ZOOM}
          onPress={handleShapePress}
        >
          {/* Cluster circles */}
          <Mapbox.CircleLayer
            id="clusters"
            filter={['has', 'point_count']}
            style={clusterCircleStyle}
          />

          {/* Cluster count labels */}
          <Mapbox.SymbolLayer
            id="cluster-count"
            filter={['has', 'point_count']}
            style={clusterCountStyle}
          />

          {/* Individual markers (events, restaurants, businesses) */}
          <Mapbox.CircleLayer
            id="entity-markers"
            filter={['!', ['has', 'point_count']]}
            style={markerCircleStyle}
          />
        </Mapbox.ShapeSource>

        <Mapbox.UserLocation visible={false} />
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
