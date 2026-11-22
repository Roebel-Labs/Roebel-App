// Entwicklermodus → "Elli 3D-Karte testen".
// Throwaway test for the Elli ride feature: Mapbox Standard style (3D
// buildings, trees, lighting), tilted camera, and a 3D Elli e-van that drives
// the real road from Ludorf to Röbel Altstadt. Nothing here is a booking —
// all data is fixed test data. Decides whether the 3D look is worth building
// the ride screens on.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { Mapbox } from '@/lib/map/mapbox';
import { DEMO_ROUTE, DEMO_ROUTE_DURATION_S } from '@/lib/elli/demoRoute';
import {
  buildPolyline,
  headingAt,
  lerpAngle,
  pointAt,
  remainingFrom,
  type LngLat,
} from '@/lib/elli/routeMath';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { co2SavedGrams, formatCo2 } from '@/lib/elli/co2';

const MODEL_URL = 'https://www.roebel.app/models/elli.glb?v=2';
const ELLI_YELLOW = '#FFB703';
const NAVY = '#00498B';

const ROUTE = buildPolyline(DEMO_ROUTE);
const SPEED_MPS = ROUTE.length / DEMO_ROUTE_DURATION_S;
const PICKUP: LngLat = DEMO_ROUTE[DEMO_ROUTE.length - 1];
const ARRIVED_HOLD_S = 8;
// Test ride after pickup: 8 km to the shops; the drive to the pickup is the
// empty leg. Shows what the CO₂ line will say on a real ride.
const DEMO_RIDE_KM = 8;
const DEMO_CO2 = formatCo2(co2SavedGrams({ rideKm: DEMO_RIDE_KM, emptyKm: ROUTE.length / 1000, passengers: 1 }));
const NEXT_LEG_MIN = 11;

// Model is the real e-NV200 size in metres (4.56 m). From zoom 17 in it is
// true scale, so it grows with the map like a real car; further out it grows
// ×2 per zoom step so it keeps its zoom-17 on-screen size instead of vanishing.
const MODEL_TRUE_SCALE_ZOOM = 17;
const MODEL_SCALE = [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  10,
  Array(3).fill(2 ** (MODEL_TRUE_SCALE_ZOOM - 10)),
  MODEL_TRUE_SCALE_ZOOM,
  [1, 1, 1],
  22,
  [1, 1, 1],
];

const THEMES = ['faded', 'monochrome', 'default'] as const;
const THEME_LABEL: Record<(typeof THEMES)[number], string> = {
  faded: 'Hell',
  monochrome: 'Mono',
  default: 'Bunt',
};
const LIGHTS = ['day', 'dusk', 'night', 'dawn'] as const;
const LIGHT_LABEL: Record<(typeof LIGHTS)[number], string> = {
  day: 'Tag',
  dusk: 'Abend',
  night: 'Nacht',
  dawn: 'Morgen',
};
const CAMS = ['auto', 'follow', 'free'] as const;
const CAM_LABEL: Record<(typeof CAMS)[number], string> = {
  auto: 'Auto',
  follow: 'Folgen',
  free: 'Frei',
};
const SPEEDS = [4, 12, 1] as const;

type Vehicle = { d: number; coord: LngLat; heading: number };

function cycle<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function DevElliMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [theme, setTheme] = useState<(typeof THEMES)[number]>('faded');
  const [light, setLight] = useState<(typeof LIGHTS)[number]>(isDark ? 'night' : 'day');
  const [cam, setCam] = useState<(typeof CAMS)[number]>('auto');
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const [rotOffset, setRotOffset] = useState(-90);
  const [notify, setNotify] = useState(false);
  const [sheetH, setSheetH] = useState(320);
  const [startedAt] = useState(() => new Date());

  const [vehicle, setVehicle] = useState<Vehicle>(() => ({
    d: 0,
    coord: DEMO_ROUTE[0],
    heading: headingAt(ROUTE, 0),
  }));
  const vehicleRef = useRef(vehicle);
  const speedRef = useRef<number>(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Simulation loop: advances along the road and eases the heading, the same
  // way real driver GPS fixes will be interpolated later.
  useEffect(() => {
    let raf = 0;
    let last = Date.now();
    let lastEmit = 0;
    let d = 0;
    let heading = headingAt(ROUTE, 0);
    let holdUntil = 0;
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (d >= ROUTE.length) {
        if (!holdUntil) holdUntil = now + ARRIVED_HOLD_S * 1000;
        if (now >= holdUntil) {
          d = 0;
          holdUntil = 0;
          heading = headingAt(ROUTE, 0);
        }
      } else {
        d = Math.min(ROUTE.length, d + SPEED_MPS * speedRef.current * dt);
        heading = lerpAngle(heading, headingAt(ROUTE, d), Math.min(1, dt * 5));
      }
      if (now - lastEmit >= 33) {
        lastEmit = now;
        const next = { d, coord: pointAt(ROUTE, d), heading };
        vehicleRef.current = next;
        setVehicle(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Camera: "Auto" frames Elli and the pickup (zooms in as Elli approaches),
  // "Folgen" rides behind the van, "Frei" leaves the camera to the user.
  const cameraRef = useRef<any>(null);
  useEffect(() => {
    if (cam === 'free') return;
    const move = () => {
      const v = vehicleRef.current;
      if (cam === 'auto') {
        const lngs = [v.coord[0], PICKUP[0]];
        const lats = [v.coord[1], PICKUP[1]];
        cameraRef.current?.setCamera({
          bounds: {
            ne: [Math.max(...lngs), Math.max(...lats)],
            sw: [Math.min(...lngs), Math.min(...lats)],
          },
          padding: {
            // generous margins: the van model and the "Dein Halt" pill both
            // extend well beyond their anchor points
            paddingTop: insets.top + 170,
            paddingBottom: sheetH + 120,
            paddingLeft: 110,
            paddingRight: 110,
          },
          pitch: 58,
          heading: -18,
          animationDuration: 1000,
          animationMode: 'easeTo',
        });
      } else {
        cameraRef.current?.setCamera({
          centerCoordinate: v.coord,
          zoomLevel: 17,
          pitch: 64,
          heading: v.heading,
          padding: { paddingTop: insets.top + 60, paddingBottom: sheetH, paddingLeft: 0, paddingRight: 0 },
          animationDuration: 1000,
          animationMode: 'linearTo',
        });
      }
    };
    move();
    const id = setInterval(move, 1000);
    return () => clearInterval(id);
  }, [cam, sheetH, insets.top]);

  // Remaining route only needs to change every few metres, not every frame.
  const routeBucket = Math.floor(vehicle.d / 12);
  const remainingShape = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: remainingFrom(ROUTE, routeBucket * 12) },
    }),
    [routeBucket],
  );
  const fullShape = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: DEMO_ROUTE },
    }),
    [],
  );
  const pickupShape = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: PICKUP },
    }),
    [],
  );
  const vehicleShape = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Point' as const, coordinates: vehicle.coord },
  };

  const remainingM = ROUTE.length - vehicle.d;
  const arrived = remainingM <= 1;
  const etaMin = Math.max(1, Math.ceil(remainingM / SPEED_MPS / 60));
  const progress = vehicle.d / ROUTE.length;
  const pickupAt = new Date(startedAt.getTime() + DEMO_ROUTE_DURATION_S * 1000);
  const nextAt = new Date(pickupAt.getTime() + NEXT_LEG_MIN * 60 * 1000);

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (Math.abs(h - sheetH) > 4) setSheetH(h);
  };

  if (!Mapbox) {
    return (
      <View style={[styles.fallback, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textPrimary }}>Karte ist in diesem Build nicht verfügbar.</Text>
      </View>
    );
  }

  const sheetBg = isDark ? '#1F2023' : '#FFFFFF';
  const chipBg = isDark ? 'rgba(31,32,35,0.92)' : 'rgba(255,255,255,0.94)';
  const hairline = isDark ? '#2E3034' : '#ECEDEF';

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={StyleSheet.absoluteFill}
        styleURL="mapbox://styles/mapbox/standard"
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        onCameraChanged={(state: any) => {
          if (state?.gestures?.isGestureActive && cam !== 'free') setCam('free');
        }}
      >
        <Mapbox.StyleImport
          id="basemap"
          existing
          config={{
            theme,
            lightPreset: light,
            show3dObjects: true,
            show3dBuildings: true,
            show3dTrees: true,
            show3dLandmarks: true,
            showPointOfInterestLabels: false,
            showTransitLabels: false,
          }}
        />
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: DEMO_ROUTE[0], zoomLevel: 14.5, pitch: 58 }}
          maxZoomLevel={17.6}
        />
        <Mapbox.Models models={{ elli: MODEL_URL }} />

        {/* Whole trip, faint — the part already driven stays visible as a trail */}
        <Mapbox.ShapeSource id="elli-route-full" shape={fullShape}>
          <Mapbox.LineLayer
            id="elli-route-full-line"
            slot="middle"
            style={{
              lineColor: isDark ? '#5B6270' : '#AEB4BE',
              lineWidth: 6,
              lineCap: 'round',
              lineJoin: 'round',
              lineOpacity: 0.55,
              lineEmissiveStrength: 1,
            }}
          />
        </Mapbox.ShapeSource>
        <Mapbox.ShapeSource id="elli-route-ahead" shape={remainingShape}>
          <Mapbox.LineLayer
            id="elli-route-ahead-casing"
            slot="middle"
            style={{
              lineColor: '#FFFFFF',
              lineWidth: 11,
              lineCap: 'round',
              lineJoin: 'round',
              lineEmissiveStrength: 1,
            }}
          />
          <Mapbox.LineLayer
            id="elli-route-ahead-line"
            slot="middle"
            style={{
              lineColor: isDark ? '#7ABBF2' : NAVY,
              lineWidth: 7,
              lineCap: 'round',
              lineJoin: 'round',
              lineEmissiveStrength: 1,
            }}
          />
        </Mapbox.ShapeSource>

        <Mapbox.ShapeSource id="elli-pickup" shape={pickupShape}>
          <Mapbox.CircleLayer
            id="elli-pickup-dot"
            style={{
              circleRadius: 9,
              circleColor: isDark ? '#7ABBF2' : NAVY,
              circleStrokeColor: '#FFFFFF',
              circleStrokeWidth: 4,
              circlePitchAlignment: 'map',
              circleEmissiveStrength: 1,
            }}
          />
        </Mapbox.ShapeSource>

        <Mapbox.ShapeSource id="elli-vehicle" shape={vehicleShape}>
          {/* Soft yellow ground halo — also the fallback if the model fails to load */}
          <Mapbox.CircleLayer
            id="elli-vehicle-halo"
            style={{
              circleRadius: 26,
              circleColor: ELLI_YELLOW,
              circleOpacity: 0.28,
              circleBlur: 0.4,
              circlePitchAlignment: 'map',
              circleEmissiveStrength: 1,
            }}
          />
          <Mapbox.ModelLayer
            id="elli-vehicle-model"
            style={{
              modelId: 'elli',
              modelType: 'common-3d',
              modelScale: MODEL_SCALE as any,
              modelRotation: [0, 0, (vehicle.heading + rotOffset + 360) % 360],
              modelCastShadows: true,
              modelReceiveShadows: true,
              modelOpacity: 1,
            }}
          />
        </Mapbox.ShapeSource>

        <Mapbox.MarkerView coordinate={PICKUP} anchor={{ x: 0.5, y: 1 }} allowOverlap>
          <View style={styles.pickupWrap} pointerEvents="none">
            <View style={[styles.pickupPill, { backgroundColor: sheetBg }]}>
              <Text style={[styles.pickupTitle, { color: colors.textPrimary }]}>Dein Halt</Text>
              <Text style={[styles.pickupSub, { color: colors.textSecondary }]}>Röbel · Altstadt</Text>
            </View>
            <View style={[styles.pickupStem, { backgroundColor: sheetBg }]} />
          </View>
        </Mapbox.MarkerView>

        {!arrived ? (
          <Mapbox.MarkerView coordinate={vehicle.coord} anchor={{ x: 0.5, y: 1 }} allowOverlap>
            <View style={styles.etaWrap} pointerEvents="none">
              <View style={styles.etaPill}>
                <Text style={styles.etaText}>{etaMin} Min</Text>
              </View>
            </View>
          </Mapbox.MarkerView>
        ) : null}
      </Mapbox.MapView>

      {/* Top: back + test controls */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          style={[styles.roundBtn, { backgroundColor: chipBg }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={22} height={22} color={colors.textPrimary} />
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Chip label="Stil" value={THEME_LABEL[theme]} bg={chipBg} color={colors.textPrimary}
            onPress={() => setTheme((t) => cycle(THEMES, t))} />
          <Chip label="Licht" value={LIGHT_LABEL[light]} bg={chipBg} color={colors.textPrimary}
            onPress={() => setLight((l) => cycle(LIGHTS, l))} />
          <Chip label="Kamera" value={CAM_LABEL[cam]} bg={chipBg} color={colors.textPrimary}
            onPress={() => setCam((c) => cycle(CAMS, c))} />
          <Chip label="Tempo" value={`${speed}×`} bg={chipBg} color={colors.textPrimary}
            onPress={() => setSpeed((s) => cycle(SPEEDS, s))} />
          <Chip label="Modell" value={`${rotOffset}°`} bg={chipBg} color={colors.textPrimary}
            onPress={() => setRotOffset((r) => (r + 90 > 180 ? r - 270 : r + 90))} />
        </ScrollView>
      </View>

      {/* Bottom sheet */}
      <View
        onLayout={onSheetLayout}
        style={[
          styles.sheet,
          { backgroundColor: sheetBg, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: hairline }]} />

        <View style={styles.etaRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: colors.textSecondary }]}>
              {arrived ? 'Elli steht an deinem Halt' : 'Elli kommt zu: Röbel · Altstadt'}
            </Text>
            <Text style={[styles.bigEta, { color: colors.textPrimary }]}>
              {arrived ? 'Elli ist da' : (
                <>
                  {etaMin}
                  <Text style={styles.bigEtaUnit}> Min</Text>
                </>
              )}
            </Text>
            <Text style={[styles.status, { color: colors.success }]}>
              {arrived ? 'Steig in Ruhe ein – Elli wartet auf dich.' : `Pünktlich · an ${hhmm(pickupAt)}`}
            </Text>
            {arrived ? (
              <Pressable onPress={() => router.push('/elli/co2' as any)} hitSlop={8}>
                <Text style={[styles.co2Line, { color: colors.textPrimary }]}>
                  🍃 Statt Diesel-Auto: ca. {DEMO_CO2} CO₂ gespart auf {DEMO_RIDE_KM} km →
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.testTag, { borderColor: hairline }]}>
            <Text style={[styles.testTagText, { color: colors.textSecondary }]}>Testfahrt</Text>
          </View>
        </View>

        {/* Trip progress */}
        <View style={styles.trackWrap}>
          <View style={[styles.track, { backgroundColor: hairline }]}>
            <View
              style={[
                styles.trackFill,
                { width: `${Math.round(progress * 100)}%`, backgroundColor: isDark ? '#7ABBF2' : NAVY },
              ]}
            />
          </View>
          <View
            style={[
              styles.trackVan,
              { left: `${Math.round(progress * 100)}%`, borderColor: sheetBg },
            ]}
          />
        </View>
        <View style={styles.trackLabels}>
          <View>
            <Text style={[styles.trackLabel, { color: colors.textSecondary }]}>Losgefahren · Ludorf</Text>
            <Text style={[styles.trackTime, { color: colors.textPrimary }]}>{hhmm(startedAt)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.trackLabel, { color: isDark ? '#7ABBF2' : NAVY }]}>Dein Halt</Text>
            <Text style={[styles.trackTime, { color: colors.textPrimary }]}>{hhmm(pickupAt)}</Text>
          </View>
        </View>
        <Text style={[styles.nextLeg, { color: colors.textSecondary }]}>
          Danach weiter zur Bahnhofstraße · an {hhmm(nextAt)}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={() => setNotify((n) => !n)}
            style={[
              styles.primaryBtn,
              notify
                ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: isDark ? '#7ABBF2' : NAVY }
                : { backgroundColor: isDark ? '#7ABBF2' : NAVY },
            ]}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.primaryBtnText,
                { color: notify ? (isDark ? '#7ABBF2' : NAVY) : isDark ? '#0B1B2B' : '#FFFFFF' },
              ]}
            >
              {notify ? '✓ Wir sagen 2 Min vorher Bescheid' : 'Bescheid sagen, wenn Elli nah ist'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert('Testfahrt', 'Hier rufst du später direkt Elli oder die Fahrerin an.')
            }
            style={[styles.callBtn, { backgroundColor: hairline }]}
            accessibilityRole="button"
            accessibilityLabel="Anrufen"
          >
            <Text style={styles.callIcon}>📞</Text>
          </Pressable>
        </View>

        <View style={[styles.driverRow, { borderTopColor: hairline }]}>
          <View style={[styles.avatar, { backgroundColor: ELLI_YELLOW }]}>
            <Text style={styles.avatarText}>E</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.driverName, { color: colors.textPrimary }]}>Elli-Fahrdienst</Text>
            <Text style={[styles.driverSub, { color: colors.textSecondary }]}>
              Gelbes Elektroauto · ehrenamtlich gefahren
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Chip({
  label,
  value,
  bg,
  color,
  onPress,
}: {
  label: string;
  value: string;
  bg: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: bg }]} accessibilityRole="button">
      <Text style={[styles.chipLabel, { color }]}>
        {label}: <Text style={styles.chipValue}>{value}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  co2Line: { fontFamily: fontFamily.semiBold, fontSize: 14, marginTop: 8 },
  container: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { gap: 8, paddingHorizontal: 10, paddingRight: 16 },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  chipLabel: { fontFamily: fontFamily.regular, fontSize: 13 },
  chipValue: { fontFamily: fontFamily.semiBold },

  pickupWrap: { alignItems: 'center' },
  pickupPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, alignItems: 'center' },
  pickupTitle: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  pickupSub: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 1 },
  pickupStem: { width: 3, height: 18 },

  etaWrap: { alignItems: 'center', paddingBottom: 44 },
  etaPill: {
    backgroundColor: '#111214',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  etaText: { color: '#FFFFFF', fontFamily: fontFamily.semiBold, fontSize: 13 },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
  etaRow: { flexDirection: 'row', alignItems: 'flex-start' },
  kicker: { fontFamily: fontFamily.medium, fontSize: 14 },
  bigEta: { fontFamily: fontFamily.heading, fontSize: 44, lineHeight: 50, marginTop: 2 },
  bigEtaUnit: { fontFamily: fontFamily.headingSemiBold, fontSize: 24 },
  status: { fontFamily: fontFamily.medium, fontSize: 14, marginTop: 2 },
  testTag: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  testTagText: { fontFamily: fontFamily.medium, fontSize: 11 },

  trackWrap: { marginTop: 18, height: 16, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3 },
  trackVan: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    backgroundColor: ELLI_YELLOW,
    borderWidth: 3,
  },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  trackLabel: { fontFamily: fontFamily.medium, fontSize: 12 },
  trackTime: { fontFamily: fontFamily.semiBold, fontSize: 16, marginTop: 1 },
  nextLeg: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 10 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  primaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  callBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  callIcon: { fontSize: 20 },

  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.heading, fontSize: 18, color: '#111214' },
  driverName: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  driverSub: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 1 },
});
