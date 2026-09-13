import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ArrowLeftIcon, CallIcon, LocationIcon, SearchIcon } from '@/components/Icons';
import SearchModal from '@/components/SearchModal';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import MapboxMapView from '@/components/map/MapboxMapView';
import ErrorBoundary from '@/components/ErrorBoundary';
import MapPrivacyConsent from '@/components/map/MapPrivacyConsent';
import MapFilterBar from '@/components/map/MapFilterBar';
import MapCategoryRow, { MAP_CATEGORY_ROW_HEIGHT } from '@/components/map/MapCategoryRow';
import MapBottomFade from '@/components/map/MapBottomFade';
import MapExploreButton, { EXPLORE_BUTTON_HEIGHT } from '@/components/map/MapExploreButton';
import MapIconButton from '@/components/map/MapIconButton';
import MapCategorySheet from '@/components/map/MapCategorySheet';
import { categoryByKey, type MapCategoryKey } from '@/lib/map/categories';
import MapPlaceSheet from '@/components/map/MapPlaceSheet';
import { placeKey, type PlaceItem } from '@/lib/map/place-item';
import { itemsForCategory } from '@/lib/map/category-items';
import { useRecommendationScores } from '@/hooks/useRecommendationScores';
import VerlorenSheet from '@/components/utilities/VerlorenSheet';

import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { MAP_PRIVACY_STORAGE_KEY, ROEBEL_CENTER } from '@/lib/map/constants';
import {
  processEventsWithCoordinates,
  processOrgsWithCoordinates,
  entitiesToGeoJSON,
  type EventWithCoordinates,
  type OrgWithCoordinates,
} from '@/lib/map/geojson';
import { fetchAllOrgAccounts } from '@/lib/supabase-accounts';
import { buildOrgIndex, EMPTY_ORG_INDEX } from '@/lib/map/org-lookup';
import { filterOpenNow, type MapFilterState } from '@/lib/map/filters';
import type {
  Account,
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

// Mapbox SDK + token init is centralized so embedded maps work regardless of
// which screen loads first. Fails gracefully in Expo Go (Mapbox === null).
import { isMapboxAvailable } from '@/lib/map/mapbox';

/** How far the bottom fade reaches above the category row before it is gone. */
const FADE_LEAD = 48;

export default function LocationScreen() {
  const router = useRouter();
  const { selectedEventId, focusEntityType, focusEntityId, filterOnly } = useLocalSearchParams<{
    selectedEventId?: string;
    focusEntityType?: MapEntityType;
    focusEntityId?: string;
    filterOnly?: string;
  }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Bottom stack, from the screen edge up: the button row (SOS, Erkunden,
  // search), the category row, the locate button. The fade under all of it
  // reaches FADE_LEAD past the row so the frost is already there when the
  // labels start.
  const exploreBottom = Math.max(insets.bottom, 12) + 6;
  const rowBottom = exploreBottom + EXPLORE_BUTTON_HEIGHT + 10;
  const rowTop = rowBottom + MAP_CATEGORY_ROW_HEIGHT;
  const fadeHeight = rowTop + FADE_LEAD;
  const locateBottom = rowTop + 12;

  const [events, setEvents] = useState<EventWithCoordinates[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [pois, setPois] = useState<PoiRecord[]>([]);
  const [orgs, setOrgs] = useState<OrgWithCoordinates[]>([]);
  // All org accounts, geocoded or not — the geocoded ones are the org pins,
  // the rest are what a restaurant/business pin resolves to. See org-lookup.
  const [allOrgs, setAllOrgs] = useState<Account[]>([]);
  const [advisories, setAdvisories] = useState<DailyAdvisoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<PlaceItem | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MapCategoryKey | null>(null);
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

  // Fade the map chrome (bottom row, pills, buttons) out while any sheet is
  // open. The sheets render above the chrome regardless; the fade only keeps
  // faded-out controls from catching taps around the sheet's edges.
  const chromeHidden = !!selection || !!activeCategory;
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(chromeOpacity, {
      toValue: chromeHidden ? 0 : 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chromeHidden, chromeOpacity]);

  const [mapFilter, setMapFilter] = useState<MapFilterState>(
    filterOnly === 'orgs'
      ? { events: false, restaurants: true, businesses: true, orgs: true, pois: false, openNow: false, acceptsStablecoin: false }
      : { events: true, restaurants: true, businesses: true, orgs: true, pois: false, openNow: false, acceptsStablecoin: false }
  );

  // Re-apply the filter if the deep-link param changes after mount
  useEffect(() => {
    if (filterOnly === 'orgs') {
      setMapFilter({
        events: false,
        restaurants: true,
        businesses: true,
        orgs: true,
        pois: false,
        openNow: false,
        acceptsStablecoin: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOnly]);

  // "Jetzt geöffnet" applies to places with opening hours; a marker tap still
  // finds its entity because findPlaceItem reads the unfiltered lists.
  const visibleRestaurants = useMemo(
    () => filterOpenNow(restaurants, mapFilter.openNow),
    [restaurants, mapFilter.openNow]
  );
  const visibleBusinesses = useMemo(
    () => filterOpenNow(businesses, mapFilter.openNow),
    [businesses, mapFilter.openNow]
  );
  const visibleOrgs = useMemo(
    () => filterOpenNow(orgs, mapFilter.openNow),
    [orgs, mapFilter.openNow]
  );

  const geojson = useMemo(
    () =>
      entitiesToGeoJSON(
        mapFilter.events ? events : [],
        mapFilter.restaurants ? visibleRestaurants : [],
        mapFilter.businesses ? visibleBusinesses : [],
        mapFilter.pois ? pois : [],
        mapFilter.orgs ? visibleOrgs : []
      ),
    [events, visibleRestaurants, visibleBusinesses, pois, visibleOrgs, mapFilter]
  );

  const orgIndex = useMemo(
    () =>
      allOrgs.length ? buildOrgIndex(allOrgs, restaurants, businesses) : EMPTY_ORG_INDEX,
    [allOrgs, restaurants, businesses]
  );

  // Every org that stands behind a pin — the accounts whose votes and saves
  // rank the Empfehlungen sheet. Fetched only while that sheet is open.
  const pinAccountIds = useMemo(
    () => Array.from(new Set(orgIndex.byPin.values())),
    [orgIndex]
  );
  const recommendationScores = useRecommendationScores(
    activeCategory === 'empfehlungen' ? pinAccountIds : null
  );

  // `tickNow` (a 15s clock) stands in for "now" so the list is a pure function
  // of state rather than of a Date read during render.
  const categoryItems = useMemo(
    () =>
      activeCategory
        ? itemsForCategory(
            activeCategory,
            { events, restaurants, businesses, orgs },
            { orgIndex, scores: recommendationScores, now: tickNow }
          )
        : [],
    [activeCategory, events, restaurants, businesses, orgs, orgIndex, recommendationScores, tickNow]
  );

  const onSelectCategory = useCallback(
    (key: MapCategoryKey) => {
      if (activeCategory === key) {
        setActiveCategory(null);
        setMapFilter((prev) => ({
          ...prev,
          events: true,
          restaurants: true,
          businesses: true,
          orgs: true,
          pois: true,
        }));
        return;
      }
      setActiveCategory(key);
      const layers = categoryByKey(key)?.layers;
      if (layers) setMapFilter((prev) => ({ ...prev, ...layers }));
    },
    [activeCategory]
  );

  const selectedFeatureId = selection ? placeKey(selection) : null;

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
        openSelectionFor('event', event.id);
        setFlyToCoordinate([event.longitude, event.latitude]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, events]);

  // Deep-link for generic entity focus (used e.g. by the org profile page)
  useEffect(() => {
    if (!focusEntityType || !focusEntityId) return;
    if (loading) return;
    openSelectionFor(focusEntityType, focusEntityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEntityType, focusEntityId, loading, events, restaurants, businesses, pois, orgs]);

  const fetchMapData = async () => {
    try {
      setLoading(true);
      const [
        eventsResult,
        restaurantsResult,
        businessesResult,
        poisResult,
        advisoriesResult,
        orgsResult,
      ] =
        await Promise.all([
          supabase
            .from('events')
            .select('*')
            .eq('status', 'approved')
            .order('date', { ascending: true }),
          supabase.from('restaurants').select('*').eq('status', 'published'),
          // NB: businesses use 'published'/'pending' — never 'approved'.
          supabase.from('businesses').select('*').eq('status', 'published'),
          fetchPois(),
          fetchTodayAdvisories(),
          fetchAllOrgAccounts(),
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
      setAllOrgs(orgsResult);
      setOrgs(processOrgsWithCoordinates(orgsResult));
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

  // The PlaceItem for a pin, from the unfiltered lists so a tap always finds
  // its entity even while a layer or "Jetzt geöffnet" hides it.
  const findPlaceItem = (entityType: MapEntityType, id: string): PlaceItem | null => {
    switch (entityType) {
      case 'event': {
        const e = events.find((x) => x.id === id);
        return e ? { id: e.id, entityType: 'event', lat: e.latitude, lon: e.longitude, data: e } : null;
      }
      case 'restaurant': {
        const r = restaurants.find((x) => x.id === id);
        return r && r.latitude != null && r.longitude != null
          ? { id: r.id, entityType: 'restaurant', lat: r.latitude, lon: r.longitude, data: r }
          : null;
      }
      case 'business': {
        const b = businesses.find((x) => x.id === id);
        return b && b.latitude != null && b.longitude != null
          ? { id: b.id, entityType: 'business', lat: b.latitude, lon: b.longitude, data: b }
          : null;
      }
      case 'poi': {
        const p = pois.find((x) => x.id === id);
        return p ? { id: p.id, entityType: 'poi', lat: p.lat, lon: p.lon, data: p } : null;
      }
      case 'org': {
        const o = orgs.find((x) => x.id === id);
        return o
          ? { id: o.id, entityType: 'org', lat: o.latitude, lon: o.longitude, data: o as Account }
          : null;
      }
      default:
        return null;
    }
  };

  const selectPlace = (item: PlaceItem) => {
    setSelection(item);
    setFlyToCoordinate([item.lon, item.lat]);
  };

  const openSelectionFor = (entityType: MapEntityType, id: string) => {
    const item = findPlaceItem(entityType, id);
    if (item) selectPlace(item);
  };

  const handleMarkerPress = (id: string, entityType: MapEntityType) => {
    openSelectionFor(entityType, id);
  };

  // The map is usually pushed from Erkunden; a deep link has nothing behind
  // it, so back falls through to the explore feed rather than doing nothing.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/explore' as any);
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.mapContainer}>
        {!privacyAccepted ? (
          <MapPrivacyConsent onAccept={handlePrivacyAccept} />
        ) : (
          <>
            <ErrorBoundary
              fallback={
                <View style={[styles.mapFallback, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.mapFallbackText, { color: colors.textPrimary }]}>
                    Die Karte ist gerade nicht verfügbar. Bitte versuche es später erneut.
                  </Text>
                </View>
              }
            >
            <MapboxMapView
              geojson={geojson}
              onMarkerPress={handleMarkerPress}
              flyToCoordinate={flyToCoordinate}
              selectedFeatureId={selectedFeatureId}
              vehiclesGeoJSON={showLiveBuses ? vehiclesGeoJSON : null}
              onVehiclePress={(depId) => {
                const v = vehicles.find((x) => x.id === depId);
                if (!v) return;
                const isElli = v.mode === 'buergerbus';
                const title = isElli ? `${v.line_code} · auf Anruf` : `${v.line_code} · live`;
                const body =
                  `${v.line_name_de}\n` +
                  (isElli
                    ? `Elli unterwegs in ${v.current_stop_name ?? 'der Region'}.\nReservierung Mo–Fr 10–14 Uhr unter +49 151 63459759`
                    : v.next_stop_name
                    ? `→ ${v.next_stop_name}` +
                      (v.arrives_in_minutes != null
                        ? ` (in ~${Math.round(v.arrives_in_minutes)} min)`
                        : '')
                    : '');
                Alert.alert(title, body, [
                  { text: 'Schließen', style: 'cancel' },
                  {
                    text: 'Linie öffnen',
                    onPress: () =>
                      router.push({
                        pathname: '/transit/line/[code]',
                        params: { code: v.line_code },
                      } as any),
                  },
                ]);
              }}
            />
            </ErrorBoundary>

            {/* Top-left: back. Search moved down to the bottom row. */}
            <SafeAreaView style={styles.topHeader} edges={['top']} pointerEvents="box-none">
              <MapIconButton onPress={goBack} accessibilityLabel="Zurück">
                <ArrowLeftIcon size={20} color={colors.textPrimary} />
              </MapIconButton>
            </SafeAreaView>

            {/* Today's advisories — visible when Tipps layer is on */}
            {mapFilter.pois && advisories.length > 0 ? (
              <View style={styles.advisoriesRow}>
                {advisories.map((adv) => (
                  <View
                    key={adv.id}
                    style={[
                      styles.advisoryChip,
                      { backgroundColor: colors.card },
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

            {/* Bottom emoji filter bar — sits above the action row */}
            <MapFilterBar
              filter={mapFilter}
              onFilterChange={setMapFilter}
              liveBuses={showLiveBuses}
              onToggleLiveBuses={() => setShowLiveBuses((v) => !v)}
              liveBusCount={vehicles.length}
              position="top"
              bottom={insets.top + 64}
              opacity={chromeOpacity}
            />

            {/* The frosted ground under the bottom chrome — from the screen
                edge up past the category row. Not faded: sheets open over it. */}
            <MapBottomFade height={fadeHeight} />

            {/* Browse row — icon above, label beneath, standing on the fade. */}
            <MapCategoryRow
              activeKey={activeCategory}
              onSelect={onSelectCategory}
              bottom={rowBottom}
              opacity={chromeOpacity}
              hidden={chromeHidden}
            />

            {/* Bottom row on the fade, above the safe area: SOS at the left
                edge, Erkunden centred, search at the right edge. */}
            <Animated.View
              style={[styles.bottomRow, { bottom: exploreBottom, opacity: chromeOpacity }]}
              pointerEvents={chromeHidden ? 'none' : 'box-none'}
            >
              <MapIconButton
                onPress={() => setShowVerloren(true)}
                accessibilityLabel="Wo bin ich verloren"
              >
                <CallIcon size={20} color={colors.textPrimary} />
              </MapIconButton>
              <MapExploreButton onPress={() => router.push('/explore' as any)} />
              <MapIconButton onPress={() => setShowSearchModal(true)} accessibilityLabel="Suchen">
                <SearchIcon size={20} color={colors.textPrimary} />
              </MapIconButton>
            </Animated.View>

            {/* Locate stays bottom-right, floating above the category row. */}
            <Animated.View
              style={[styles.locateFloat, { bottom: locateBottom, opacity: chromeOpacity }]}
              pointerEvents={chromeHidden ? 'none' : 'box-none'}
            >
              <MapIconButton onPress={handleLocateMe} accessibilityLabel="Mein Standort">
                <LocationIcon size={20} color={colors.textPrimary} />
              </MapIconButton>
            </Animated.View>
          </>
        )}
      </View>

      <VerlorenSheet visible={showVerloren} onClose={() => setShowVerloren(false)} />

      {/* Sheets live in their own layer over the map container, so no z-index
          inside it (the category row, the buttons) can ever paint above them.
          A place chosen from a category list opens the place sheet in front;
          the category sheet returns when it closes. */}
      <View style={styles.sheetLayer} pointerEvents="box-none">
        {selection ? (
          <MapPlaceSheet
            item={selection}
            onClose={() => setSelection(null)}
            orgIndex={orgIndex}
          />
        ) : null}

        {activeCategory && !selection ? (
          <MapCategorySheet
            categoryKey={activeCategory}
            items={categoryItems}
            onSelectPlace={selectPlace}
            onClose={() => setActiveCategory(null)}
            orgIndex={orgIndex}
            scores={recommendationScores}
          />
        ) : null}
      </View>

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
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  mapFallbackText: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
    textAlign: 'center',
    lineHeight: 22,
  },
  topHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 200,
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
    fontFamily: fontFamily.medium,
  },
  bottomRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2000,
  },
  locateFloat: {
    position: 'absolute',
    right: 16,
    zIndex: 2000,
  },
  sheetLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3000,
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
    fontFamily: fontFamily.semiBold,
    marginBottom: 8,
    textAlign: 'center',
  },
  fallbackText: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
});
