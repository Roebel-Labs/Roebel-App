import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  ROEBEL_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
} from '@/lib/map/constants';
import type { MapGeoJSON } from '@/lib/map/geojson';
import type { MapEntityType } from '@/lib/types';
import MakiIcon from './MakiIcon';
import { Mapbox } from '@/lib/map/mapbox';

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

  // Outdoors style is more vibrant for the Müritz Nationalpark setting
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

  const handleVehiclePress = useCallback(
    (e: any) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id;
      if (id && onVehiclePress) onVehiclePress(id);
    },
    [onVehiclePress]
  );

  // Pull entity features once per render. Each becomes a PointAnnotation
  // — uses MakiIcon (react-native-svg, single-color black) instead of
  // Mapbox SymbolLayer + Maki sprite, because the Outdoors style ships
  // colored (non-SDF) Maki icons that ignore iconColor.
  const entityFeatures = useMemo(() => geojson.features ?? [], [geojson]);

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

        {/* Per-feature PointAnnotation — white circle + black Maki icon */}
        {entityFeatures.map((feat: any) => {
          const props = feat.properties ?? {};
          const id = props.id as string;
          const entityType = props.entityType as MapEntityType;
          const maki = (props.maki as string) || 'marker';
          const coords = feat.geometry?.coordinates as [number, number] | undefined;
          if (!id || !coords) return null;
          return (
            <Mapbox.PointAnnotation
              key={`${entityType}-${id}`}
              id={`${entityType}-${id}`}
              coordinate={coords}
              onSelected={() => onMarkerPress(id, entityType)}
            >
              <View style={styles.markerWrap}>
                <View style={styles.markerCircle}>
                  <MakiIcon name={maki} size={18} color="#000000" />
                </View>
              </View>
            </Mapbox.PointAnnotation>
          );
        })}

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
  // The wrap absorbs any layout that PointAnnotation may apply around children;
  // sized to ~32 px so the centred icon dot has consistent hit-testing.
  markerWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
