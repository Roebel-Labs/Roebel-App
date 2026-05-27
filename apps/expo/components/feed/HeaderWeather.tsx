import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet, Pressable, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchCurrentConditions, getWeatherIcon } from '@/lib/weather';

type WeatherState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      tempC: number;
      conditionType: string;
      description: string;
      precipitationProbability: number;
    }
  | { kind: 'error' };

type Props = {
  fallbackSource: ImageSourcePropType;
  fallbackTintColor: string;
};

export function HeaderWeather({ fallbackSource, fallbackTintColor }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const [state, setState] = useState<WeatherState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetchCurrentConditions()
      .then((c) => {
        if (cancelled) return;
        setState({
          kind: 'ready',
          tempC: c.tempC,
          conditionType: c.conditionType,
          description: c.conditionText,
          precipitationProbability: c.precipitationProbability,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openWeather = () => router.push('/weather' as any);

  if (state.kind === 'loading') {
    return (
      <Pressable
        onPress={openWeather}
        accessibilityRole="button"
        accessibilityLabel="Wetter öffnen"
        hitSlop={8}
      >
        <View style={[styles.skeleton, { backgroundColor: colors.skeleton }]} />
      </Pressable>
    );
  }

  if (state.kind === 'error') {
    return (
      <Pressable
        onPress={openWeather}
        accessibilityRole="button"
        accessibilityLabel="Wetter öffnen"
        hitSlop={8}
      >
        <Image
          source={fallbackSource}
          style={styles.fallback}
          contentFit="contain"
          tintColor={fallbackTintColor}
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    );
  }

  const Icon = getWeatherIcon(state.conditionType, state.precipitationProbability);

  return (
    <Pressable
      onPress={openWeather}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`Wetter: ${state.description}, ${Math.round(state.tempC)} Grad`}
      hitSlop={8}
    >
      <Icon width={22} height={22} />
      <Text style={[styles.temperature, { color: colors.textPrimary }]}>
        {Math.round(state.tempC)}°
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fallback: {
    width: 84,
    height: 36,
  },
  skeleton: {
    width: 56,
    height: 28,
    borderRadius: 8,
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
