import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { MARKER_IMAGES } from '@/lib/map/markers';
import type { MapEntityType } from '@/lib/types';
import { Mapbox } from '@/lib/map/mapbox';

type Props = {
  geojson: MapGeoJSON;
  onMarkerPress: (id: string, entityType: MapEntityType) => void;
  flyToCoordinate?: [number, number] | null; // [lng, lat]
  // fid ("entityType-id") of the currently selected pin — gets an accent ring
  selectedFeatureId?: string | null;
  vehiclesGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  onVehiclePress?: (departureId: string) => void;
};

// Marker circle radius / emoji text size / PNG icon scale per size class
const PIN_RADIUS = ['match', ['get', 'size'], 'sm', 11, 'md', 15, 'lg', 21, 15];
const EMOJI_SIZE = ['match', ['get', 'size'], 'sm', 12, 'md', 17, 'lg', 24, 17];
const ICON_SCALE = ['match', ['get', 'size'], 'sm', 0.25, 'md', 0.35, 'lg', 0.5, 0.35];
const LABEL_FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];

const NOT_CLUSTER = ['!', ['has', 'point_count']];
const IS_CLUSTER = ['has', 'point_count'];
const HAS_IMAGE = ['has', 'markerImage'];
const NO_IMAGE = ['!', ['has', 'markerImage']];

export default function MapboxMapView({
  geojson,
  onMarkerPress,
  flyToCoordinate,
  selectedFeatureId,
  vehiclesGeoJSON,
  onVehiclePress,
}: Props) {
  const { isDark, colors } = useTheme();
  const cameraRef = useRef<any>(null);
  const entitySourceRef = useRef<any>(null);

  // Outdoors style is more vibrant for the Müritz Nationalpark setting
  // (terrain, parks, water in color); fall back to Light/Dark for monochrome.
  const styleURL = Mapbox
    ? isDark
      ? Mapbox.StyleURL.Dark
      : Mapbox.StyleURL.Outdoors || Mapbox.StyleURL.Light
    : '';

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

  const handleEntityPress = useCallback(
    async (e: any) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const props = feat.properties ?? {};
      if (props.cluster) {
        // Cluster tap — zoom to the level where it splits apart
        const coords = feat.geometry?.coordinates as [number, number] | undefined;
        if (!coords) return;
        let zoom = DEFAULT_ZOOM + 2;
        try {
          zoom = await entitySourceRef.current?.getClusterExpansionZoom(feat);
        } catch {
          // fall back to a fixed step
        }
        cameraRef.current?.setCamera({
          centerCoordinate: coords,
          zoomLevel: Math.min(zoom ?? MAX_ZOOM, MAX_ZOOM),
          animationDuration: 500,
          animationMode: 'easeTo',
        });
        return;
      }
      if (props.id && props.entityType) {
        onMarkerPress(props.id, props.entityType as MapEntityType);
      }
    },
    [onMarkerPress]
  );

  // If Mapbox isn't available (Expo Go), render nothing — parent shows fallback
  if (!Mapbox) return null;

  // Theme-aware layer colors (Mapbox styles need literal values, not tokens)
  const pinBg = isDark ? '#2d2e31' : '#ffffff';
  const pinStroke = isDark ? '#5f6368' : '#E5E7EB';
  const labelColor = isDark ? '#e8eaed' : '#111827';
  const labelHalo = isDark ? '#18191B' : '#ffffff';
  const accent = colors.primary;

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

        <Mapbox.Images images={MARKER_IMAGES} />

        {/* Entities — one clustered source, Corner-style emoji/PNG pins */}
        <Mapbox.ShapeSource
          id="entities-source"
          ref={entitySourceRef}
          shape={geojson}
          cluster
          clusterRadius={CLUSTER_RADIUS}
          clusterMaxZoomLevel={CLUSTER_MAX_ZOOM}
          onPress={handleEntityPress}
        >
          {/* Cluster bubbles */}
          <Mapbox.CircleLayer
            id="entity-clusters"
            filter={IS_CLUSTER as any}
            style={{
              circleRadius: 20,
              circleColor: pinBg,
              circleStrokeWidth: 2,
              circleStrokeColor: accent,
              circleOpacity: 0.95,
            }}
          />
          <Mapbox.SymbolLayer
            id="entity-cluster-count"
            filter={IS_CLUSTER as any}
            style={{
              textField: ['get', 'point_count_abbreviated'] as any,
              textSize: 14,
              textColor: labelColor,
              textFont: LABEL_FONT as any,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />

          {/* Selected pin — accent ring under the pin */}
          <Mapbox.CircleLayer
            id="entity-selected-ring"
            filter={
              ['all', NOT_CLUSTER, ['==', ['get', 'fid'], selectedFeatureId ?? '']] as any
            }
            style={{
              circleRadius: ['+', PIN_RADIUS, 5] as any,
              circleColor: 'rgba(0,0,0,0)',
              circleStrokeWidth: 3,
              circleStrokeColor: accent,
            }}
          />

          {/* Pin background circles (emoji pins only) */}
          <Mapbox.CircleLayer
            id="entity-pin-bg"
            filter={['all', NOT_CLUSTER, NO_IMAGE] as any}
            style={{
              circleRadius: PIN_RADIUS as any,
              circleColor: pinBg,
              circleStrokeWidth: 1.5,
              circleStrokeColor: pinStroke,
            }}
          />
          <Mapbox.SymbolLayer
            id="entity-pin-emoji"
            filter={['all', NOT_CLUSTER, NO_IMAGE] as any}
            style={{
              textField: ['get', 'emoji'] as any,
              textSize: EMOJI_SIZE as any,
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textHaloWidth: 0,
            }}
          />

          {/* Custom PNG pins (Mühle & friends) */}
          <Mapbox.SymbolLayer
            id="entity-pin-image"
            filter={['all', NOT_CLUSTER, HAS_IMAGE] as any}
            style={{
              iconImage: ['get', 'markerImage'] as any,
              iconSize: ICON_SCALE as any,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />

          {/* Name labels — featured always, the rest from zoom 14 */}
          <Mapbox.SymbolLayer
            id="entity-label-featured"
            filter={['all', NOT_CLUSTER, ['==', ['get', 'featured'], true]] as any}
            style={{
              textField: ['get', 'title'] as any,
              textSize: 12,
              textColor: labelColor,
              textHaloColor: labelHalo,
              textHaloWidth: 1.4,
              textFont: LABEL_FONT as any,
              textAnchor: 'left',
              textOffset: [1.6, 0] as any,
              textMaxWidth: 9,
              textOptional: true,
            }}
          />
          <Mapbox.SymbolLayer
            id="entity-label"
            filter={['all', NOT_CLUSTER, ['!=', ['get', 'featured'], true]] as any}
            minZoomLevel={14}
            style={{
              textField: ['get', 'title'] as any,
              textSize: 11,
              textColor: labelColor,
              textHaloColor: labelHalo,
              textHaloWidth: 1.4,
              textFont: LABEL_FONT as any,
              textAnchor: 'left',
              textOffset: [1.6, 0] as any,
              textMaxWidth: 9,
              textOptional: true,
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
                textFont: LABEL_FONT as any,
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
  container: { flex: 1 },
  map: { flex: 1 },
});
