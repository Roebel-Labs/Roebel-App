import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { SearchIcon } from '@/components/Icons';
import SearchModal from '@/components/SearchModal';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import BottomNavigation from '@/components/BottomNavigation';
import MapboxMapView from '@/components/map/MapboxMapView';
import MapPreviewCard, { type MapPreviewData } from '@/components/map/MapPreviewCard';
import MapPrivacyConsent from '@/components/map/MapPrivacyConsent';
import MyLocationButton from '@/components/map/MyLocationButton';
import MapFilterChips, { type MapFilter } from '@/components/map/MapFilterChips';
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
import type { EventRecord, RestaurantRecord, BusinessRecord, MapEntityType } from '@/lib/types';
import {
  fetchPois,
  fetchTodayAdvisories,
  type PoiRecord,
  type DailyAdvisoryRecord,
  ADVISORY_LEVEL_COLORS,
  ADVISORY_LEVEL_LABELS_DE,
} from '@/lib/supabase-pois';
import {
  fetchTransitLines,
  fetchTransitStops,
  fetchTransitDepartures,
  type TransitLine,
  type TransitStop,
  type TransitDeparture,
} from '@/lib/supabase-transit';
import { computeLiveVehicles, vehiclesToGeoJSON, type LiveVehicle } from '@/lib/live-vehicles';

// Try to load Mapbox — fails gracefully in Expo Go
let Mapbox: any = null;
let isMapboxAvailable = false;
try {
  Mapbox = require('@rnmapbox/maps').default;
  isMapboxAvailable = true;
} catch {
  // Native module not available (Expo Go)
}

// Initialize Mapbox with access token (only if available)
const mapboxToken =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  '';

if (isMapboxAvailable && Mapbox) {
  Mapbox.setAccessToken(mapboxToken);
}

export default function LocationScreen() {
  const router = useRouter();
  const { selectedEventId } = useLocalSearchParams<{ selectedEventId?: string }>();
  const { colors } = useTheme();

  const [events, setEvents] = useState<EventWithCoordinates[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [pois, setPois] = useState<PoiRecord[]>([]);
  const [advisories, setAdvisories] = useState<DailyAdvisoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<MapPreviewData | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showVerloren, setShowVerloren] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [showLiveBuses, setShowLiveBuses] = useState(true);
  const [transitLines, setTransitLines] = useState<TransitLine[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [transitDepartures, setTransitDepartures] = useState<TransitDeparture[]>([]);
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [tickNow, setTickNow] = useState<Date>(new Date());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'profile'>('explore');
  const [flyToCoordinate, setFlyToCoordinate] = useState<[number, number] | null>(null);
  const [mapFilter, setMapFilter] = useState<MapFilter>({
    events: true,
    restaurants: true,
    businesses: true,
    pois: false,
  });

  // Build unified GeoJSON from all entities, respecting active filters
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

  // Check privacy consent on mount
  useEffect(() => {
    AsyncStorage.getItem(MAP_PRIVACY_STORAGE_KEY).then((value) => {
      if (value === 'true') setPrivacyAccepted(true);
    });
  }, []);

  // Fetch all map data from Supabase
  useEffect(() => {
    fetchMapData();
  }, []);

  // Load transit data (lines/stops/departures) once for live-bus simulation
  useEffect(() => {
    void Promise.all([fetchTransitLines(), fetchTransitStops(), fetchTransitDepartures()]).then(
      ([l, s, d]) => {
        setTransitLines(l);
        setTransitStops(s);
        setTransitDepartures(d);
      }
    );
  }, []);

  // Tick every 15 s — recomputes live vehicle positions
  useEffect(() => {
    tickRef.current = setInterval(() => setTickNow(new Date()), 15000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Recompute vehicles whenever schedule data or tickNow changes
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

  // Fly to selected event when deep-linked
  useEffect(() => {
    if (selectedEventId && events.length > 0) {
      const event = events.find((e) => e.id === selectedEventId);
      if (event) {
        setSelectedEntity({ entityType: 'event', event });
        setFlyToCoordinate([event.longitude, event.latitude]);
      }
    }
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

      if (eventsResult.error) console.error('Error fetching events:', eventsResult.error);
      if (restaurantsResult.error) console.error('Error fetching restaurants:', restaurantsResult.error);
      if (businessesResult.error) console.error('Error fetching businesses:', businessesResult.error);

      // Auto-center on Röbel/Müritz unless deep-linked to a specific event
      if (!selectedEventId) {
        setFlyToCoordinate(ROEBEL_CENTER);
      }
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
    } catch (error) {
      Alert.alert(
        'Fehler',
        'Die Datenschutzbestimmungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.'
      );
    }
  };

  const handleMarkerPress = (id: string, entityType: MapEntityType) => {
    if (entityType === 'event') {
      const event = events.find((e) => e.id === id);
      if (event) {
        setSelectedEntity({ entityType: 'event', event });
        setFlyToCoordinate([event.longitude, event.latitude]);
      }
    } else if (entityType === 'restaurant') {
      const restaurant = restaurants.find((r) => r.id === id);
      if (restaurant) {
        setSelectedEntity({ entityType: 'restaurant', restaurant });
        if (restaurant.latitude && restaurant.longitude) {
          setFlyToCoordinate([restaurant.longitude, restaurant.latitude]);
        }
      }
    } else if (entityType === 'business') {
      const business = businesses.find((b) => b.id === id);
      if (business) {
        setSelectedEntity({ entityType: 'business', business });
        if (business.latitude && business.longitude) {
          setFlyToCoordinate([business.longitude, business.latitude]);
        }
      }
    } else if (entityType === 'poi') {
      const poi = pois.find((p) => p.id === id);
      if (poi) {
        setSelectedEntity({ entityType: 'poi', poi });
        setFlyToCoordinate([poi.lon, poi.lat]);
      }
    }
  };

  const handleTabPress = (tab: 'home' | 'explore' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'home') router.replace('/');
    else if (tab === 'explore') router.push('/explore');
    else if (tab === 'profile') router.push('/profile');
  };

  const handleLocationFound = (coordinate: [number, number]) => {
    setFlyToCoordinate(coordinate);
  };

  // Expo Go fallback — native Mapbox module not available
  if (!isMapboxAvailable) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.fallbackContainer}>
          <Text style={[styles.fallbackEmoji]}>🗺️</Text>
          <Text style={[styles.fallbackTitle, { color: colors.text }]}>
            Karte nicht verfügbar
          </Text>
          <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>
            Die Karte erfordert einen Dev-Client Build und ist in Expo Go nicht verfügbar.
          </Text>
        </View>
        <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <MapLoadingSkeleton />
        <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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

            {/* Filter chips */}
            <MapFilterChips filter={mapFilter} onFilterChange={setMapFilter} />

            {/* Live ÖPNV toggle pill — top right */}
            <Pressable
              onPress={() => setShowLiveBuses((v) => !v)}
              style={[
                styles.liveBusToggle,
                {
                  backgroundColor: showLiveBuses ? '#194383' : colors.background,
                },
              ]}
            >
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: showLiveBuses ? '#2B9348' : colors.textTertiary },
                ]}
              />
              <Text
                style={[
                  styles.liveBusText,
                  { color: showLiveBuses ? '#fff' : colors.textPrimary },
                ]}
              >
                Live ÖPNV {showLiveBuses ? `· ${vehicles.length}` : ''}
              </Text>
            </Pressable>

            {/* Today's advisories — visible when Tipps layer is on */}
            {mapFilter.pois && advisories.length > 0 ? (
              <View style={styles.advisoriesRow}>
                {advisories.map((adv) => (
                  <View
                    key={adv.id}
                    style={[
                      styles.advisoryChip,
                      { backgroundColor: ADVISORY_LEVEL_COLORS[adv.level] + '22' },
                    ]}
                  >
                    <Text style={styles.advisoryEmoji}>
                      {adv.type === 'mosquito'
                        ? '🦟'
                        : adv.type === 'tick'
                        ? '🕷️'
                        : adv.type === 'cyanobacteria'
                        ? '💧'
                        : adv.type === 'sun'
                        ? '☀️'
                        : '🌼'}
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

            {/* Floating Search Button */}
            <Pressable
              style={({ pressed }) => [
                styles.floatingSearchBtn,
                { backgroundColor: colors.background },
                pressed && styles.floatingSearchBtnPressed,
              ]}
              accessibilityLabel="Suchen"
              onPress={() => setShowSearchModal(true)}
            >
              <SearchIcon width={22} height={22} color={colors.tabIconActive} />
            </Pressable>

            {/* "Verloren?" button — high z-index so it stays above bottom sheets */}
            <Pressable
              style={({ pressed }) => [
                styles.verlorenBtn,
                pressed && styles.floatingSearchBtnPressed,
              ]}
              accessibilityLabel="Wo bin ich verloren"
              onPress={() => setShowVerloren(true)}
            >
              <Text style={styles.verlorenEmoji}>🆘</Text>
              <Text style={styles.verlorenLabel}>Verloren?</Text>
            </Pressable>

            {/* My Location Button (always above bottom sheets) */}
            <MyLocationButton onLocationFound={handleLocationFound} />

            {/* Centered Karte/Liste toggle — always above bottom sheet */}
            <View style={styles.viewToggleWrap}>
              <View style={[styles.viewToggle, { backgroundColor: colors.background }]}>
                <Pressable
                  onPress={() => setViewMode('map')}
                  style={[
                    styles.viewToggleBtn,
                    viewMode === 'map' && { backgroundColor: '#194383' },
                  ]}
                >
                  <Text
                    style={[
                      styles.viewToggleText,
                      { color: viewMode === 'map' ? '#fff' : colors.textPrimary },
                    ]}
                  >
                    Karte
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setViewMode('list')}
                  style={[
                    styles.viewToggleBtn,
                    viewMode === 'list' && { backgroundColor: '#194383' },
                  ]}
                >
                  <Text
                    style={[
                      styles.viewToggleText,
                      { color: viewMode === 'list' ? '#fff' : colors.textPrimary },
                    ]}
                  >
                    Liste
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* List view — stacked on top of the map when viewMode === 'list' */}
            {viewMode === 'list' ? (
              <View style={[styles.listOverlay, { backgroundColor: colors.background }]}>
                <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 220 }}>
                  {mapFilter.pois &&
                    pois.map((p) => (
                      <Pressable
                        key={`poi-${p.id}`}
                        style={[styles.listRow, { backgroundColor: colors.surface }]}
                        onPress={() => router.push({ pathname: '/poi/[id]', params: { id: p.id } } as any)}
                      >
                        <Text style={styles.listEmoji}>📍</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.listTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {p.name_de}
                          </Text>
                          <Text style={[styles.listSub, { color: colors.textSecondary }]} numberOfLines={1}>
                            {p.address || ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  {mapFilter.events &&
                    events.map((e) => (
                      <Pressable
                        key={`event-${e.id}`}
                        style={[styles.listRow, { backgroundColor: colors.surface }]}
                        onPress={() =>
                          router.push({ pathname: '/event/[id]', params: { id: e.id } } as any)
                        }
                      >
                        <Text style={styles.listEmoji}>📅</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.listTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {e.title}
                          </Text>
                          <Text style={[styles.listSub, { color: colors.textSecondary }]} numberOfLines={1}>
                            {e.location}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  {mapFilter.restaurants &&
                    restaurants.map((r) => (
                      <Pressable
                        key={`r-${r.id}`}
                        style={[styles.listRow, { backgroundColor: colors.surface }]}
                        onPress={() =>
                          router.push({
                            pathname: '/restaurant/[slug]',
                            params: { slug: r.slug },
                          } as any)
                        }
                      >
                        <Text style={styles.listEmoji}>🍽️</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.listTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {r.name}
                          </Text>
                          <Text style={[styles.listSub, { color: colors.textSecondary }]} numberOfLines={1}>
                            {r.address || ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  {mapFilter.businesses &&
                    businesses.map((b) => (
                      <Pressable
                        key={`b-${b.id}`}
                        style={[styles.listRow, { backgroundColor: colors.surface }]}
                        onPress={() =>
                          router.push({
                            pathname: '/business/[slug]',
                            params: { slug: b.slug },
                          } as any)
                        }
                      >
                        <Text style={styles.listEmoji}>🏪</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.listTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {b.name}
                          </Text>
                          <Text style={[styles.listSub, { color: colors.textSecondary }]} numberOfLines={1}>
                            {b.address || ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        )}
      </View>

      <VerlorenSheet visible={showVerloren} onClose={() => setShowVerloren(false)} />

      <MapPreviewCard
        data={selectedEntity}
        onClose={() => setSelectedEntity(null)}
      />

      <SearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />

      <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
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
  floatingSearchBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 100,
  },
  floatingSearchBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
  verlorenBtn: {
    position: 'absolute',
    bottom: 240,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#D62828',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 16,
    zIndex: 2000,
  },
  viewToggleWrap: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2000,
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 22,
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 16,
  },
  viewToggleBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
  },
  viewToggleText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  listOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  listEmoji: {
    fontSize: 22,
  },
  listTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  listSub: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  verlorenEmoji: {
    fontSize: 16,
  },
  verlorenLabel: {
    color: '#fff',
    fontFamily: 'Inter-Medium',
    fontSize: 13,
  },
  advisoriesRow: {
    position: 'absolute',
    top: 70,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  advisoryEmoji: {
    fontSize: 13,
  },
  advisoryText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  liveBusToggle: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 1500,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveBusText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
});
