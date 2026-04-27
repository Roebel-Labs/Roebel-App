import React, { useState } from 'react';
import { StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { LocationIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  onLocationFound: (coordinate: [number, number]) => void;
};

export default function MyLocationButton({ onLocationFound }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoading(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      onLocationFound([position.coords.longitude, position.coords.latitude]);
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.background },
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
      accessibilityLabel="Mein Standort"
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.tabIconActive} />
      ) : (
        <LocationIcon width={22} height={22} color={colors.tabIconActive} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 240,
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
    elevation: 16,
    zIndex: 2000,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
});
