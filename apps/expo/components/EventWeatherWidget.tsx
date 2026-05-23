import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { WeatherData } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { getWeatherIcon, translateWeatherCondition } from '@/lib/weather';

// Weather stats icons
import RainStatIcon from '@/assets/icons/weather-stats/rain.svg';
import WindStatIcon from '@/assets/icons/weather-stats/fast-wind.svg';
import HumidityIcon from '@/assets/icons/weather-stats/humidity.svg';
import UVIcon from '@/assets/icons/weather-stats/uv-02.svg';

type Props = {
  date: string; // YYYY-MM-DD format
  latitude?: number | null;
  longitude?: number | null;
};

// Röbel/Müritz default coordinates
const ROEBEL_COORDS = {
  latitude: 53.3667,
  longitude: 12.6000,
};

export default function EventWeatherWidget({ date, latitude, longitude }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    async function fetchWeather() {
      try {
        // Calculate days until event
        const eventDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        eventDate.setHours(0, 0, 0, 0);

        const daysUntilEvent = Math.floor((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Only fetch if event is within 10 days (Google Weather API limit)
        if (daysUntilEvent < 0 || daysUntilEvent > 10) {
          setError(true);
          setLoading(false);
          return;
        }

        // Use event coordinates or fallback to Röbel/Müritz
        const lat = latitude || ROEBEL_COORDS.latitude;
        const lng = longitude || ROEBEL_COORDS.longitude;

        // Get API key from environment
        const apiKey =
          Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

        if (!apiKey) {
          console.error('Weather API: No API key found');
          setError(true);
          setLoading(false);
          return;
        }

        // Fetch weather data from Google Weather API
        // Request enough days to cover the event (always request at least 1 more than needed)
        const requestedDays = Math.min(15, Math.max(1, daysUntilEvent + 2));
        const url = `https://weather.googleapis.com/v1/forecast/days:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&days=${requestedDays}&unitsSystem=METRIC`;

        console.log(`Weather API: Requesting ${requestedDays} days of forecast for event ${daysUntilEvent} days away`);

        const response = await fetch(url);

        if (!response.ok) {
          console.error('Weather API error:', response.status, response.statusText);
          setError(true);
          setLoading(false);
          return;
        }

        const data = await response.json();

        // Debug logging
        console.log('Weather API Response:', JSON.stringify(data, null, 2));

        // Find the forecast for the specific event date
        const forecastDays = data.forecastDays || [];
        console.log(`Weather API: Event date is ${date}, days until event: ${daysUntilEvent}`);
        console.log(`Weather API: Received ${forecastDays.length} forecasts`);

        let eventDayForecast = null;

        // Primary approach: Match by displayDate object (most reliable)
        eventDayForecast = forecastDays.find((forecast: any) => {
          const displayDate = forecast.displayDate;

          // Try matching displayDate object format {year, month, day}
          if (displayDate?.year && displayDate?.month && displayDate?.day) {
            const matches = displayDate.year === eventDate.getFullYear() &&
                   displayDate.month === eventDate.getMonth() + 1 &&
                   displayDate.day === eventDate.getDate();
            if (matches) {
              console.log(`Weather API: Matched by displayDate object for ${date}`);
              return true;
            }
          }

          return false;
        });

        // Fallback: Use array index if displayDate matching failed
        if (!eventDayForecast && daysUntilEvent >= 0 && daysUntilEvent < forecastDays.length) {
          eventDayForecast = forecastDays[daysUntilEvent];
          console.log(`Weather API: Using index ${daysUntilEvent} for event forecast`);
        }

        if (!eventDayForecast) {
          console.error(`Weather API: No forecast found for event date ${date}`);
          console.error(`Weather API: Days until event: ${daysUntilEvent}, Forecast count: ${forecastDays.length}`);
          console.error('Weather API: Available forecasts:', forecastDays.map((f: any) => f.displayDate));
          setError(true);
          setLoading(false);
          return;
        }

        console.log('Weather API: Successfully matched forecast:', eventDayForecast);

        // Extract relevant weather data
        const dayForecast = eventDayForecast.daytimeForecast || {};
        const weatherCondition = dayForecast.weatherCondition || {};

        const weatherData: WeatherData = {
          temperature: {
            high: eventDayForecast.maxTemperature?.degrees || 0,
            low: eventDayForecast.minTemperature?.degrees || 0,
          },
          condition: weatherCondition.description?.text || 'Unbekannt',
          conditionCode: weatherCondition.type || 'UNKNOWN',
          precipitationProbability: (dayForecast.precipitation?.probability?.percent || 0) / 100, // Convert to 0-1 range
          windSpeed: dayForecast.wind?.speed?.value || 0,
          humidity: (dayForecast.relativeHumidity || 0) / 100, // Convert to 0-1 range
          uvIndex: dayForecast.uvIndex || 0,
        };

        console.log('Weather data extracted:', weatherData);

        setWeather(weatherData);
        setLoading(false);
      } catch (err) {
        console.error('Weather fetch error:', err);
        setError(true);
        setLoading(false);
      }
    }

    fetchWeather();
  }, [date, latitude, longitude]);

  // Don't render anything if there's an error or no data
  if (error || !weather) {
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.surfaceSecondary }]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Wetterdaten werden geladen...</Text>
      </View>
    );
  }

  const WeatherIcon = getWeatherIcon(
    weather.conditionCode,
    weather.precipitationProbability * 100,
  );
  const translatedCondition = translateWeatherCondition(weather.condition);

  return (
    <View style={[styles.container, { borderColor: colors.borderSecondary }]}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <WeatherIcon width={40} height={40} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.condition, { color: colors.textTertiary }]}>{translatedCondition}</Text>
          <Text style={[styles.temperature, { color: colors.textPrimary }]}>
            {Math.round(weather.temperature.high)}° / {Math.round(weather.temperature.low)}°
          </Text>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailItem}>
          <RainStatIcon width={20} height={20} />
          <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>Regen</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{Math.round(weather.precipitationProbability * 100)}%</Text>
        </View>

        <View style={styles.detailItem}>
          <WindStatIcon width={20} height={20} />
          <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>Wind</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{Math.round(weather.windSpeed)} km/h</Text>
        </View>

        <View style={styles.detailItem}>
          <HumidityIcon width={20} height={20} />
          <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>Feuchtigkeit</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{Math.round(weather.humidity * 100)}%</Text>
        </View>

        <View style={styles.detailItem}>
          <UVIcon width={20} height={20} />
          <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>UV-Index</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{weather.uvIndex}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  condition: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  temperature: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  detailLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 2,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
