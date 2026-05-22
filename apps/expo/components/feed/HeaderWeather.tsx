import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { useTheme } from '@/context/ThemeContext';

import SunIcon from '@/assets/icons/weather/sun-01.svg';
import SunCloudIcon from '@/assets/icons/weather/sun-cloud-02.svg';
import CloudIcon from '@/assets/icons/weather/blur.svg';
import RainIcon from '@/assets/icons/weather/cloud-mid-rain.svg';
import LightRainIcon from '@/assets/icons/weather/cloud-little-rain.svg';
import HeavyRainIcon from '@/assets/icons/weather/cloud-angled-rain.svg';
import ThunderIcon from '@/assets/icons/weather/sun-cloud-angled-rain-zap-02.svg';
import SnowIcon from '@/assets/icons/weather/sun-cloud-mid-snow-02.svg';
import WindyIcon from '@/assets/icons/weather/sun-cloud-fast-wind-02.svg';

const ROEBEL_COORDS = {
  latitude: 53.3667,
  longitude: 12.6,
};

type WeatherState =
  | { kind: 'loading' }
  | { kind: 'ready'; tempC: number; conditionType: string; description: string }
  | { kind: 'error' };

type Props = {
  fallbackSource: ImageSourcePropType;
  fallbackTintColor: string;
};

const getWeatherIcon = (conditionType: string) => {
  const type = conditionType.toUpperCase();
  if (type.includes('CLEAR') || type.includes('SUNNY')) return SunIcon;
  if (type === 'PARTLY_CLOUDY' || type === 'MOSTLY_CLOUDY') return SunCloudIcon;
  if (type === 'CLOUDY' || type.includes('OVERCAST')) return CloudIcon;
  if (type === 'LIGHT_RAIN' || type === 'DRIZZLE') return LightRainIcon;
  if (type === 'RAIN' || type === 'SHOWERS') return RainIcon;
  if (type === 'HEAVY_RAIN') return HeavyRainIcon;
  if (type.includes('THUNDER') || type.includes('STORM')) return ThunderIcon;
  if (type.includes('SNOW') || type.includes('FLURRIES')) return SnowIcon;
  if (type.includes('SLEET') || type.includes('ICE')) return SnowIcon;
  if (type.includes('FOG') || type.includes('MIST') || type.includes('HAZE')) return CloudIcon;
  if (type.includes('WIND')) return WindyIcon;
  return SunCloudIcon;
};

export function HeaderWeather({ fallbackSource, fallbackTintColor }: Props) {
  const { colors } = useTheme();
  const [state, setState] = useState<WeatherState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const apiKey =
        (Constants.expoConfig?.extra as Record<string, string> | undefined)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        if (!cancelled) setState({ kind: 'error' });
        return;
      }

      const url =
        `https://weather.googleapis.com/v1/currentConditions:lookup` +
        `?key=${apiKey}` +
        `&location.latitude=${ROEBEL_COORDS.latitude}` +
        `&location.longitude=${ROEBEL_COORDS.longitude}` +
        `&unitsSystem=METRIC`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          if (!cancelled) setState({ kind: 'error' });
          return;
        }
        const data = await response.json();
        const tempC = data?.temperature?.degrees;
        const conditionType = data?.weatherCondition?.type;
        const description = data?.weatherCondition?.description?.text ?? '';

        if (typeof tempC !== 'number' || typeof conditionType !== 'string') {
          if (!cancelled) setState({ kind: 'error' });
          return;
        }

        if (!cancelled) {
          setState({ kind: 'ready', tempC, conditionType, description });
        }
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind !== 'ready') {
    return (
      <Image
        source={fallbackSource}
        style={styles.fallback}
        contentFit="contain"
        tintColor={fallbackTintColor}
        accessibilityIgnoresInvertColors
        accessibilityLabel="Moin!"
      />
    );
  }

  const Icon = getWeatherIcon(state.conditionType);

  return (
    <View
      style={styles.container}
      accessibilityRole="text"
      accessibilityLabel={`${state.description}, ${Math.round(state.tempC)} Grad`}
    >
      <Icon width={22} height={22} />
      <Text style={[styles.temperature, { color: colors.textPrimary }]}>
        {Math.round(state.tempC)}°
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    width: 84,
    height: 36,
  },
  container: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  temperature: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
