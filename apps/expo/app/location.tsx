import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
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
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<MapPreviewData | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'map' | 'profile'>('map');
  const [flyToCoordinate, setFlyToCoordinate] = useState<[number, number] | null>(null);
  const [mapFilter, setMapFilter] = useState<MapFilter>({
    events: true,
    restaurants: true,
    businesses: true,
  });

  // Build unified GeoJSON from all entities, respecting active filters
  const geojson = useMemo(
    () =>
      entitiesToGeoJSON(
        mapFilter.events ? events : [],
        mapFilter.restaurants ? restaurants : [],
        mapFilter.businesses ? businesses : []
      ),
    [events, restaurants, businesses, mapFilter]
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
      const [eventsResult, restaurantsResult, businessesResult] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('status', 'approved')
          .order('date', { ascending: true }),
        supabase
          .from('restaurants')
          .select('*')
          .eq('status', 'published'),
        supabase
          .from('businesses')
          .select('*')
          .eq('status', 'approved'),
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
    }
  };

  const handleTabPress = (tab: 'home' | 'explore' | 'map' | 'profile') => {
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
            />

            {/* Filter chips */}
            <MapFilterChips filter={mapFilter} onFilterChange={setMapFilter} />

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

            {/* My Location Button */}
            <MyLocationButton onLocationFound={handleLocationFound} />
          </>
        )}
      </View>

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
});
