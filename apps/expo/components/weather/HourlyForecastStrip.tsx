import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import RainStatIcon from '@/assets/icons/weather-stats/rain.svg';
import WindStatIcon from '@/assets/icons/weather-stats/fast-wind.svg';
import { formatHourLabel, getWeatherIcon, type HourlyEntry } from '@/lib/weather';

type Props = {
  hourly: HourlyEntry[];
};

export default function HourlyForecastStrip({ hourly }: Props) {
  const { colors } = useTheme();

  if (!hourly.length) return null;

  return (
    <View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Stündliche Vorhersage</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {hourly.map((entry, index) => {
          const Icon = getWeatherIcon(entry.conditionType, entry.precipitationProbability);
          const label = index === 0 ? 'Jetzt' : formatHourLabel(entry.date);
          return (
            <View key={entry.date.toISOString() + index} style={styles.column}>
              <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>{label}</Text>
              <Text style={[styles.temp, { color: colors.textPrimary }]}>
                {Math.round(entry.tempC)}°C
              </Text>
              <Icon width={36} height={36} />
              <View style={styles.metric}>
                <RainStatIcon width={14} height={14} />
                <Text style={[styles.metricText, { color: colors.textPrimary }]}>
                  {Math.round(entry.precipitationProbability)} %
                </Text>
              </View>
              <View style={styles.metric}>
                <WindStatIcon width={14} height={14} />
                <Text style={[styles.metricText, { color: colors.textPrimary }]}>
                  {Math.round(entry.windSpeedKmh)} km/h
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  row: {
    gap: 16,
    paddingRight: 16,
  },
  column: {
    width: 76,
    alignItems: 'center',
    gap: 8,
  },
  timeLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  temp: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
