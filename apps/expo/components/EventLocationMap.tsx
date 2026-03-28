import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  latitude: number;
  longitude: number;
  location: string;
  eventId: string;
};

export default function EventLocationMap({ latitude, longitude, location, eventId }: Props) {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const mapboxToken =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!mapboxToken) {
    console.error('Location Map: No Mapbox token found');
    return null;
  }

  const style = isDark ? 'dark-v11' : 'light-v11';
  const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/pin-s+194383(${longitude},${latitude})/${longitude},${latitude},14,0/600x300@2x?access_token=${mapboxToken}`;

  const handlePress = () => {
    router.push(`/location?selectedEventId=${eventId}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderColor: colors.surface }]}>
      <Pressable onPress={handlePress} style={[styles.mapPressable, { backgroundColor: colors.surface }]}>
        <Image
          source={{ uri: staticMapUrl }}
          style={styles.mapImage}
          resizeMode="cover"
        />
        <View style={styles.overlay}>
          <View style={styles.viewMapButton}>
            <Text style={styles.viewMapText}>Auf Karte anzeigen</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  mapPressable: {
    position: 'relative',
    height: 200,
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewMapButton: {
    backgroundColor: '#194383',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  viewMapText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
});
