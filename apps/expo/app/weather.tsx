import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { fetchAllWeather, type WeatherSnapshot } from '@/lib/weather';
import CurrentWeatherCard from '@/components/weather/CurrentWeatherCard';
import HourlyForecastStrip from '@/components/weather/HourlyForecastStrip';
import WeeklyForecastList from '@/components/weather/WeeklyForecastList';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: WeatherSnapshot }
  | { kind: 'error' };

export default function WeatherScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const snapshot = await fetchAllWeather();
      setState({ kind: 'ready', snapshot });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchAllWeather();
        if (!cancelled) setState({ kind: 'ready', snapshot });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          hitSlop={8}
        >
          <ChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Wetter</Text>
        <View style={styles.backButton} />
      </View>

      {state.kind === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {state.kind === 'error' && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            Wetterdaten konnten nicht geladen werden.
          </Text>
          <Pressable
            onPress={load}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      )}

      {state.kind === 'ready' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <CurrentWeatherCard
            current={state.snapshot.current}
            today={state.snapshot.daily[0] ?? null}
          />
          <View style={styles.section}>
            <HourlyForecastStrip hourly={state.snapshot.hourly} />
          </View>
          <View style={styles.section}>
            <WeeklyForecastList daily={state.snapshot.daily} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  section: {
    marginTop: 28,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
