import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { useTheme } from '@/context/ThemeContext';

// Weather SVG icons
import SunIcon from '@/assets/icons/weather/sun-01.svg';
import SunCloudIcon from '@/assets/icons/weather/sun-cloud-02.svg';
import CloudIcon from '@/assets/icons/weather/blur.svg';
import RainIcon from '@/assets/icons/weather/cloud-mid-rain.svg';
import SnowIcon from '@/assets/icons/weather/sun-cloud-mid-snow-02.svg';
import ThunderIcon from '@/assets/icons/weather/sun-cloud-angled-rain-zap-02.svg';
import WindIcon from '@/assets/icons/weather/sun-cloud-fast-wind-02.svg';

const DAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Röbel coordinates
const ROEBEL_LAT = 53.3667;
const ROEBEL_LNG = 12.6000;

// Cache duration: 30 minutes
const CACHE_DURATION_MS = 30 * 60 * 1000;

interface WeatherCache {
  temp: number;
  conditionType: string;
  fetchedAt: number;
}

let weatherCache: WeatherCache | null = null;

function getWeatherIcon(conditionType: string) {
  const type = (conditionType || '').toUpperCase();
  if (type.includes('CLEAR') || type.includes('SUNNY')) return SunIcon;
  if (type.includes('PARTLY') || type.includes('MOSTLY_CLOUDY')) return SunCloudIcon;
  if (type.includes('CLOUDY') || type.includes('OVERCAST')) return CloudIcon;
  if (type.includes('THUNDER') || type.includes('STORM')) return ThunderIcon;
  if (type.includes('SNOW') || type.includes('SLEET') || type.includes('ICE')) return SnowIcon;
  if (type.includes('RAIN') || type.includes('DRIZZLE') || type.includes('SHOWER')) return RainIcon;
  if (type.includes('WIND')) return WindIcon;
  return SunCloudIcon;
}

export default function ContextBar() {
  const { colors } = useTheme();
  const [temp, setTemp] = useState<number | null>(null);
  const [conditionType, setConditionType] = useState<string>('');
  const fetchedRef = useRef(false);

  const now = new Date();
  const dayName = DAYS_DE[now.getDay()];
  const day = now.getDate();
  const month = MONTHS_DE[now.getMonth()];

  useEffect(() => {
    // Use cache if fresh
    if (weatherCache && Date.now() - weatherCache.fetchedAt < CACHE_DURATION_MS) {
      setTemp(weatherCache.temp);
      setConditionType(weatherCache.conditionType);
      return;
    }

    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchWeather() {
      try {
        const apiKey =
          Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

        if (!apiKey) return;

        const url = `https://weather.googleapis.com/v1/forecast/days:lookup?key=${apiKey}&location.latitude=${ROEBEL_LAT}&location.longitude=${ROEBEL_LNG}&days=1&unitsSystem=METRIC`;

        const response = await fetch(url);
        if (!response.ok) return;

        const data = await response.json();
        const today = data.forecastDays?.[0];
        if (!today) return;

        const currentTemp = Math.round(
          ((today.maxTemperature?.degrees || 0) + (today.minTemperature?.degrees || 0)) / 2
        );
        const type = today.daytimeForecast?.weatherCondition?.type || 'PARTLY_CLOUDY';

        weatherCache = { temp: currentTemp, conditionType: type, fetchedAt: Date.now() };
        setTemp(currentTemp);
        setConditionType(type);
      } catch {
        // Silently fail — show date only
      }
    }

    fetchWeather();
  }, []);

  const WeatherIcon = conditionType ? getWeatherIcon(conditionType) : null;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {temp !== null && WeatherIcon ? (
        <>
          <View style={styles.weatherItem}>
            <WeatherIcon width={16} height={16} />
            <Text style={[styles.item, { color: colors.textSecondary }]}>{temp}°C</Text>
          </View>
          <Text style={[styles.separator, { color: colors.border }]}>|</Text>
          <Text style={[styles.item, { color: colors.textSecondary }]}>🌊 Müritz</Text>
          <Text style={[styles.separator, { color: colors.border }]}>|</Text>
        </>
      ) : null}
      <Text style={[styles.item, { color: colors.success }]}>{dayName}, {day}. {month}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weatherItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  item: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  separator: {
    fontSize: 13,
  },
});
