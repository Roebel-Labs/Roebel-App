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
  // Optional live vehicle layer (simulated bus/ferry positions)
  vehiclesGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  onVehiclePress?: (departureId: string) => void;
};

export default function MapboxMapView({
  geojson,
  onMarkerPress,
  flyToCoordinate,
  vehiclesGeoJSON,
  onVehiclePress,
}: Props) {
  const { isDark } = useTheme();
  const cameraRef = useRef<any>(null);

  // Outdoors style is much more vibrant for the Müritz Nationalpark setting
  // (terrain, parks, water in color); fall back to Light/Dark for monochrome.
  const styleURL = Mapbox
    ? isDark
      ? Mapbox.StyleURL.Dark
      : Mapbox.StyleURL.Outdoors || Mapbox.StyleURL.Light
    : '';

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

  const handleVehiclePress = useCallback(
    (e: any) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id;
      if (id && onVehiclePress) onVehiclePress(id);
    },
    [onVehiclePress]
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

  // White-pill marker style — flat, monochrome, Yandex-Eats-clean. No border.
  const markerCircleStyle = useMemo(
    () => ({
      circleRadius: 16,
      circleColor: '#ffffff',
      circleStrokeWidth: 0,
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

          {/* Black Maki icon on top of the white circle — single-color, Yandex-Eats-clean */}
          <Mapbox.SymbolLayer
            id="entity-icons"
            filter={['!', ['has', 'point_count']]}
            style={{
              iconImage: ['concat', ['get', 'maki'], '-15'] as any,
              iconSize: 1,
              iconColor: '#000000',
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />
        </Mapbox.ShapeSource>

        {/* Live vehicles — simulated bus / ferry positions */}
        {vehiclesGeoJSON && vehiclesGeoJSON.features.length > 0 ? (
          <Mapbox.ShapeSource
            id="live-vehicles-source"
            shape={vehiclesGeoJSON}
            onPress={handleVehiclePress}
          >
            <Mapbox.CircleLayer
              id="live-vehicles-bg"
              style={{
                circleRadius: 18,
                circleColor: ['get', 'color'] as any,
                circleStrokeWidth: 3,
                circleStrokeColor: '#ffffff',
                circleSortKey: 10,
              }}
            />
            <Mapbox.SymbolLayer
              id="live-vehicles-emoji"
              style={{
                textField: ['get', 'emoji'] as any,
                textSize: 18,
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
            <Mapbox.SymbolLayer
              id="live-vehicles-label"
              style={{
                textField: ['get', 'line_code'] as any,
                textOffset: [0, 1.4] as any,
                textSize: 11,
                textColor: '#ffffff',
                textHaloColor: '#000000',
                textHaloWidth: 1.2,
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textFont: ['DIN Pro Medium', 'Arial Unicode MS Regular'],
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {/* Heading puck — animated blue arrow showing direction the user is facing */}
        <Mapbox.UserLocation
          visible={true}
          showsUserHeadingIndicator={true}
          androidRenderMode="compass"
        />
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
