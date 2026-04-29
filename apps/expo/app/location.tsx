import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import DiscoverStroke from '@/assets/icons/bottom-nav/discover.svg';

import { ArrowLeftIcon, CallIcon, LocationIcon, SearchIcon } from '@/components/Icons';
import SearchModal from '@/components/SearchModal';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import MapboxMapView from '@/components/map/MapboxMapView';
import MapPrivacyConsent from '@/components/map/MapPrivacyConsent';
import MapFilterChips, { type MapFilter } from '@/components/map/MapFilterChips';
import MapPreviewCarousel, {
  type CarouselItem,
} from '@/components/map/MapPreviewCarousel';
import VerlorenSheet from '@/components/utilities/VerlorenSheet';

import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { MAP_PRIVACY_STORAGE_KEY, ROEBEL_CENTER } from '@/lib/map/constants';
import {
  processEventsWithCoordinates,
  entitiesToGeoJSON,
  type EventWithCoordinates,
} from '@/lib/map/geojson';
import type {
  EventRecord,
  RestaurantRecord,
  BusinessRecord,
  MapEntityType,
} from '@/lib/types';
import {
  fetchPois,
  fetchTodayAdvisories,
  type PoiRecord,
  type DailyAdvisoryRecord,
  ADVISORY_LEVEL_COLORS,
  ADVISORY_LEVEL_LABELS_DE,
} from '@/lib/supabase-pois';
import * as Location from 'expo-location';
import {
  fetchTransitLines,
  fetchTransitStops,
  fetchTransitDepartures,
  type TransitLine,
  type TransitStop,
  type TransitDeparture,
} from '@/lib/supabase-transit';
import {
  computeLiveVehicles,
  vehiclesToGeoJSON,
  type LiveVehicle,
} from '@/lib/live-vehicles';

// Try to load Mapbox — fails gracefully in Expo Go
let Mapbox: any = null;
let isMapboxAvailable = false;
try {
  Mapbox = require('@rnmapbox/maps').default;
  isMapboxAvailable = true;
} catch {
  // Native module not available (Expo Go)
}

const mapboxToken =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  '';

if (isMapboxAvailable && Mapbox) {
  Mapbox.setAccessToken(mapboxToken);
}

const SHEET_LIFT_PX = 200;

export default function LocationScreen() {
  const router = useRouter();
  const { selectedEventId } = useLocalSearchParams<{ selectedEventId?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomBase = Math.max(insets.bottom, 12) + 28;

  const [events, setEvents] = useState<EventWithCoordinates[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [pois, setPois] = useState<PoiRecord[]>([]);
  const [advisories, setAdvisories] = useState<DailyAdvisoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [carousel, setCarousel] = useState<{
    items: CarouselItem[];
    selectedId: string;
  } | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showVerloren, setShowVerloren] = useState(false);
  const [showLiveBuses, setShowLiveBuses] = useState(true);
  const [transitLines, setTransitLines] = useState<TransitLine[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [transitDepartures, setTransitDepartures] = useState<TransitDeparture[]>([]);
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [tickNow, setTickNow] = useState<Date>(new Date());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [flyToCoordinate, setFlyToCoordinate] = useState<[number, number] | null>(
    ROEBEL_CENTER
  );

  // Slide bottom row up when the carousel is visible
  const bottomTranslate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(bottomTranslate, {
      toValue: carousel ? -SHEET_LIFT_PX : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [carousel, bottomTranslate]);

  const [mapFilter, setMapFilter] = useState<MapFilter>({
    events: true,
    restaurants: true,
    businesses: true,
    pois: false,
  });

  const geojson = useMemo(
    () =>
      entitiesToGeoJSON(
        mapFilter.events ? events : [],
        mapFilter.restaurants ? restaurants : [],
        mapFilter.businesses ? businesses : [],
        mapFilter.pois ? pois : []
      ),
    [events, restaurants, businesses, pois, mapFilter]
  );

  // Privacy consent
  useEffect(() => {
    AsyncStorage.getItem(MAP_PRIVACY_STORAGE_KEY).then((value) => {
      if (value === 'true') setPrivacyAccepted(true);
    });
  }, []);

  // Always centre Röbel as the initial camera position — independent of GPS
  useEffect(() => {
    setFlyToCoordinate(ROEBEL_CENTER);
  }, []);

  useEffect(() => {
    fetchMapData();
  }, []);

  // Pre-load transit + tick interval for live-bus simulation
  useEffect(() => {
    void Promise.all([
      fetchTransitLines(),
      fetchTransitStops(),
      fetchTransitDepartures(),
    ]).then(([l, s, d]) => {
      setTransitLines(l);
      setTransitStops(s);
      setTransitDepartures(d);
    });
  }, []);

  useEffect(() => {
    tickRef.current = setInterval(() => setTickNow(new Date()), 15000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showLiveBuses || transitLines.length === 0) {
      setVehicles([]);
      return;
    }
    setVehicles(
      computeLiveVehicles({
        lines: transitLines,
        stops: transitStops,
        departures: transitDepartures,
        now: tickNow,
      })
    );
  }, [showLiveBuses, transitLines, transitStops, transitDepartures, tickNow]);

  const vehiclesGeoJSON = useMemo(() => vehiclesToGeoJSON(vehicles), [vehicles]);

  // Deep-link
  useEffect(() => {
    if (selectedEventId && events.length > 0) {
      const event = events.find((e) => e.id === selectedEventId);
      if (event) {
        openCarouselFor('event', event.id);
        setFlyToCoordinate([event.longitude, event.latitude]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, events]);

  const fetchMapData = async () => {
    try {
      setLoading(true);
      const [eventsResult, restaurantsResult, businessesResult, poisResult, advisoriesResult] =
        await Promise.all([
          supabase
            .from('events')
            .select('*')
            .eq('status', 'approved')
            .order('date', { ascending: true }),
          supabase.from('restaurants').select('*').eq('status', 'published'),
          supabase.from('businesses').select('*').eq('status', 'approved'),
          fetchPois(),
          fetchTodayAdvisories(),
        ]);

      if (eventsResult.data) {
        setEvents(processEventsWithCoordinates(eventsResult.data as EventRecord[]));
      }
      if (restaurantsResult.data) {
        setRestaurants(restaurantsResult.data as RestaurantRecord[]);
      }
      if (businessesResult.data) {
        setBusinesses(businessesResult.data as BusinessRecord[]);
      }
      setPois(poisResult);
      setAdvisories(advisoriesResult);
    } catch (error) {
      console.error('Failed to fetch map data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrivacyAccept = async () => {
    try {
      await AsyncStorage.setItem(MAP_PRIVACY_STORAGE_KEY, 'true');
      setPrivacyAccepted(true);
    } catch {
      Alert.alert(
        'Fehler',
        'Die Datenschutzbestimmungen konnten nicht gespeichert werden.'
      );
    }
  };

  // Build a CarouselItem list of all entities of the given type
  const buildCarouselItems = (entityType: MapEntityType): CarouselItem[] => {
    if (entityType === 'event') {
      return events.map((e) => ({
        id: e.id,
        entityType: 'event',
        lat: e.latitude,
        lon: e.longitude,
        data: e,
      }));
    }
    if (entityType === 'restaurant') {
      return restaurants
        .filter((r) => r.latitude != null && r.longitude != null)
        .map((r) => ({
          id: r.id,
          entityType: 'restaurant',
          lat: r.latitude!,
          lon: r.longitude!,
          data: r,
        }));
    }
    if (entityType === 'business') {
      return businesses
        .filter((b) => b.latitude != null && b.longitude != null)
        .map((b) => ({
          id: b.id,
          entityType: 'business',
          lat: b.latitude!,
          lon: b.longitude!,
          data: b,
        }));
    }
    if (entityType === 'poi') {
      return pois.map((p) => ({
        id: p.id,
        entityType: 'poi',
        lat: p.lat,
        lon: p.lon,
        data: p,
      }));
    }
    return [];
  };

  const openCarouselFor = (entityType: MapEntityType, id: string) => {
    const items = buildCarouselItems(entityType);
    if (items.length === 0) return;
    const target = items.find((it) => it.id === id);
    if (!target) return;
    setCarousel({ items, selectedId: id });
    setFlyToCoordinate([target.lon, target.lat]);
  };

  const handleMarkerPress = (id: string, entityType: MapEntityType) => {
    openCarouselFor(entityType, id);
  };

  const handleCarouselSelectionChange = (item: CarouselItem) => {
    setCarousel((prev) => (prev ? { ...prev, selectedId: item.id } : prev));
    setFlyToCoordinate([item.lon, item.lat]);
  };

  const handleLocateMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setFlyToCoordinate([pos.coords.longitude, pos.coords.latitude]);
    } catch (e) {
      console.error('locate-me error', e);
    }
  };

  // Expo Go fallback
  if (!isMapboxAvailable) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackEmoji}>🗺️</Text>
          <Text style={[styles.fallbackTitle, { color: colors.textPrimary }]}>
            Karte nicht verfügbar
          </Text>
          <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>
            Die Karte erfordert einen Dev-Client Build und ist in Expo Go nicht verfügbar.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <MapLoadingSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {!privacyAccepted ? (
          <MapPrivacyConsent onAccept={handlePrivacyAccept} />
        ) : (
          <>
            <MapboxMapView
              geojson={geojson}
              onMarkerPress={handleMarkerPress}
              flyToCoordinate={flyToCoordinate}
              vehiclesGeoJSON={showLiveBuses ? vehiclesGeoJSON : null}
              onVehiclePress={(depId) => {
                const v = vehicles.find((x) => x.id === depId);
                if (!v) return;
                Alert.alert(
                  `${v.line_code} · live`,
                  `${v.line_name_de}\n` +
                    (v.next_stop_name
                      ? `→ ${v.next_stop_name}` +
                        (v.arrives_in_minutes != null
                          ? ` (in ~${Math.round(v.arrives_in_minutes)} min)`
                          : '')
                      : ''),
                  [
                    { text: 'Schließen', style: 'cancel' },
                    {
                      text: 'Linie öffnen',
                      onPress: () =>
                        router.push({
                          pathname: '/transit/line/[code]',
                          params: { code: v.line_code },
                        } as any),
                    },
                  ]
                );
              }}
            />

            {/* Top header — back left, search right */}
            <SafeAreaView style={styles.topHeader} edges={['top']} pointerEvents="box-none">
              <Pressable
                onPress={() => router.back()}
                style={styles.headerCircle}
                accessibilityLabel="Zurück"
              >
                <ArrowLeftIcon size={20} color="#000000" />
              </Pressable>
              <Pressable
                onPress={() => setShowSearchModal(true)}
                style={styles.headerCircle}
                accessibilityLabel="Suchen"
              >
                <SearchIcon size={20} color="#000000" />
              </Pressable>
            </SafeAreaView>

            {/* Filter chips — horizontal scrollable, Live ÖPNV at end */}
            <MapFilterChips
              filter={mapFilter}
              onFilterChange={setMapFilter}
              liveBuses={showLiveBuses}
              onToggleLiveBuses={() => setShowLiveBuses((v) => !v)}
              liveBusCount={vehicles.length}
            />

            {/* Today's advisories — visible when Tipps layer is on */}
            {mapFilter.pois && advisories.length > 0 ? (
              <View style={styles.advisoriesRow}>
                {advisories.map((adv) => (
                  <View
                    key={adv.id}
                    style={[
                      styles.advisoryChip,
                      { backgroundColor: '#ffffff' },
                    ]}
                  >
                    <Text style={styles.advisoryEmoji}>
                      {advisoryEmoji(adv.type)}
                    </Text>
                    <Text
                      style={[
                        styles.advisoryText,
                        { color: ADVISORY_LEVEL_COLORS[adv.level] },
                      ]}
                    >
                      {ADVISORY_LEVEL_LABELS_DE[adv.level]}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Bottom row — SOS / Erkunden / MyLocation, slides up when sheet visible */}
            <Animated.View
              style={[
                styles.bottomRow,
                { bottom: bottomBase, transform: [{ translateY: bottomTranslate }] },
              ]}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={() => setShowVerloren(true)}
                style={[styles.iconButton, { backgroundColor: '#ffffff' }]}
                accessibilityLabel="Wo bin ich verloren"
              >
                <CallIcon size={20} color="#000000" />
              </Pressable>

              <Pressable
                onPress={() => router.push('/explore' as any)}
                style={[styles.erkundenPill, { backgroundColor: '#ffffff' }]}
                accessibilityLabel="Erkunden öffnen"
              >
                <DiscoverStroke width={18} height={18} color="#000000" />
                <Text style={styles.erkundenText}>Erkunden</Text>
              </Pressable>

              <Pressable
                onPress={handleLocateMe}
                style={[styles.iconButton, { backgroundColor: '#ffffff' }]}
                accessibilityLabel="Mein Standort"
              >
                <LocationIcon size={20} color="#000000" />
              </Pressable>
            </Animated.View>
          </>
        )}
      </View>

      <VerlorenSheet visible={showVerloren} onClose={() => setShowVerloren(false)} />

      {carousel ? (
        <MapPreviewCarousel
          items={carousel.items}
          initialId={carousel.selectedId}
          onClose={() => setCarousel(null)}
          onSelectionChange={handleCarouselSelectionChange}
          bottom={bottomBase}
        />
      ) : null}

      <SearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />
    </View>
  );
}

function advisoryEmoji(type: string): string {
  switch (type) {
    case 'mosquito':
      return '🦟';
    case 'tick':
      return '🕷️';
    case 'cyanobacteria':
      return '💧';
    case 'sun':
      return '☀️';
    default:
      return '🌼';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  topHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 200,
  },
  headerCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  advisoriesRow: {
    position: 'absolute',
    top: 116,
    left: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    zIndex: 100,
    maxWidth: '80%',
  },
  advisoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  advisoryEmoji: {
    fontSize: 13,
  },
  advisoryText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 2000,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  erkundenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  erkundenText: {
    color: '#000000',
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  fallbackEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  fallbackTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
    textAlign: 'center',
  },
  fallbackText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});
