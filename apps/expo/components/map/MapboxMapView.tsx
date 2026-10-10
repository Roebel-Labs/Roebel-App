import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  ROEBEL_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  PIN_GROUP_RADIUS,
} from '@/lib/map/constants';
import type { MapFeatureProperties, MapGeoJSON } from '@/lib/map/geojson';
import { boundsSpanMeters, groupPins, type PinGroup } from '@/lib/map/clusters';
import MapPinGroup from './MapPinGroup';
import { EMOJI_IMAGE_POINTS, MARKER_IMAGES, emojiImagesFor } from '@/lib/map/markers';
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
  // Remote custom pin images keyed by feature fid (markerImagesFromIcons);
  // registered next to the bundled MARKER_IMAGES.
  markerImages?: Record<string, { uri: string; scale: number }>;
  // A group whose members sit (almost) on the same spot — zooming can't
  // pull them apart, so the screen lists them instead.
  onGroupList?: (members: MapFeatureProperties[]) => void;
};

/** Zoom is tracked in half steps so groups re-form a few times per zoom, not every frame. */
const ZOOM_STEP = 0.5;
/** Below this ground span a group can't be separated by zooming in. */
const INSEPARABLE_METERS = 25;

// Marker circle radius / emoji text size / PNG icon scale per size class
const PIN_RADIUS = ['match', ['get', 'size'], 'sm', 11, 'md', 15, 'lg', 21, 15];
// Emoji are drawn as images (see emojiImagesFor), sized in points / 24 pt.
const EMOJI_ICON_SIZE = [
  'match',
  ['get', 'size'],
  'sm', 12 / EMOJI_IMAGE_POINTS,
  'md', 17 / EMOJI_IMAGE_POINTS,
  'lg', 24 / EMOJI_IMAGE_POINTS,
  17 / EMOJI_IMAGE_POINTS,
];
const ICON_SCALE = ['match', ['get', 'size'], 'sm', 0.25, 'md', 0.35, 'lg', 0.5, 0.35];
const LABEL_FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];

// Lower sort keys are placed first, so the highest rank wins a label collision.
const LABEL_SORT_KEY = ['-', 0, ['get', 'rank']];
const HAS_IMAGE = ['has', 'markerImage'];
const NO_IMAGE = ['!', ['has', 'markerImage']];

export default function MapboxMapView({
  geojson,
  onMarkerPress,
  flyToCoordinate,
  selectedFeatureId,
  vehiclesGeoJSON,
  onVehiclePress,
  markerImages,
  onGroupList,
}: Props) {
  const { isDark, colors } = useTheme();
  const cameraRef = useRef<any>(null);
  const [zoomStep, setZoomStep] = useState(DEFAULT_ZOOM);

  // Nearby pins become photo-stack groups (lib/map/clusters). The selected
  // pin always stays on its own so its accent ring is visible.
  const { singles, groups } = useMemo(
    () => groupPins(geojson, zoomStep, PIN_GROUP_RADIUS, selectedFeatureId),
    [geojson, zoomStep, selectedFeatureId]
  );

  const handleCameraChanged = useCallback((state: any) => {
    const zoom = state?.properties?.zoom;
    if (typeof zoom !== 'number') return;
    const step = Math.floor(zoom / ZOOM_STEP) * ZOOM_STEP;
    setZoomStep((prev) => (prev === step ? prev : step));
  }, []);

  const handleGroupPress = useCallback(
    (group: PinGroup) => {
      const inseparable =
        boundsSpanMeters(group.bounds) < INSEPARABLE_METERS || zoomStep >= MAX_ZOOM - ZOOM_STEP;
      if (inseparable) {
        onGroupList?.(group.members);
        return;
      }
      const [[minLon, minLat], [maxLon, maxLat]] = group.bounds;
      // Generous bottom padding: the category row and buttons cover it.
      cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], [140, 70, 280, 70], 600);
    },
    [onGroupList, zoomStep]
  );

  const emojiImages = useMemo(
    () => ({
      ...emojiImagesFor(geojson.features),
      ...emojiImagesFor((vehiclesGeoJSON?.features ?? []) as any),
    }),
    [geojson, vehiclesGeoJSON]
  );

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
    (e: any) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const props = feat.properties ?? {};
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
        onCameraChanged={handleCameraChanged}
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

        <Mapbox.Images images={{ ...emojiImages, ...MARKER_IMAGES, ...(markerImages ?? {}) }} />

        {/* Single pins — Corner-style emoji/PNG pins. Grouped pins are drawn
            as MapPinGroup marker views below. */}
        <Mapbox.ShapeSource id="entities-source" shape={singles} onPress={handleEntityPress}>
          {/* Selected pin — accent ring under the pin */}
          <Mapbox.CircleLayer
            id="entity-selected-ring"
            filter={['==', ['get', 'fid'], selectedFeatureId ?? ''] as any}
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
            filter={NO_IMAGE as any}
            style={{
              circleRadius: PIN_RADIUS as any,
              circleColor: pinBg,
              circleStrokeWidth: 1.5,
              circleStrokeColor: pinStroke,
            }}
          />
          <Mapbox.SymbolLayer
            id="entity-pin-emoji"
            filter={NO_IMAGE as any}
            style={{
              iconImage: ['get', 'emoji'] as any,
              iconSize: EMOJI_ICON_SIZE as any,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />

          {/* Custom PNG pins (Mühle & friends) */}
          <Mapbox.SymbolLayer
            id="entity-pin-image"
            filter={HAS_IMAGE as any}
            style={{
              iconImage: ['get', 'markerImage'] as any,
              iconSize: ICON_SCALE as any,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />

          {/* Name labels — featured always, the rest from zoom 15.5. Labels
              collide (textOptional): the higher-ranked name stays. */}
          <Mapbox.SymbolLayer
            id="entity-label-featured"
            filter={['==', ['get', 'featured'], true] as any}
            style={{
              symbolSortKey: LABEL_SORT_KEY as any,
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
            filter={['!=', ['get', 'featured'], true] as any}
            minZoomLevel={15.5}
            style={{
              symbolSortKey: LABEL_SORT_KEY as any,
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

        {groups.map((group) => (
          <Mapbox.MarkerView
            key={group.key}
            coordinate={group.coordinate}
            // The front tile's centre sits on the anchor member's position.
            anchor={{ x: 0.5, y: 0.28 }}
            allowOverlap
          >
            <MapPinGroup group={group} onPress={handleGroupPress} />
          </Mapbox.MarkerView>
        ))}

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
                iconImage: ['get', 'emoji'] as any,
                iconSize: 18 / EMOJI_IMAGE_POINTS,
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
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
