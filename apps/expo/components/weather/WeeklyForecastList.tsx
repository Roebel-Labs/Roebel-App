import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import RainStatIcon from '@/assets/icons/weather-stats/rain.svg';
import WindStatIcon from '@/assets/icons/weather-stats/fast-wind.svg';
import {
  cardinalToGerman,
  formatGermanWeekday,
  getWeatherIcon,
  translateWeatherCondition,
  type DailyEntry,
} from '@/lib/weather';

type Props = {
  daily: DailyEntry[];
};

function dayLabel(date: Date, indexFromTomorrow: number): string {
  if (indexFromTomorrow === 0) return 'Morgen';
  return formatGermanWeekday(date);
}

export default function WeeklyForecastList({ daily }: Props) {
  const { colors } = useTheme();

  const days = daily.slice(1);
  if (!days.length) return null;

  return (
    <View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Wochenausblick</Text>
      <View style={styles.list}>
        {days.map((day, index) => {
          const Icon = getWeatherIcon(day.conditionType);
          const conditionText =
            day.conditionText || translateWeatherCondition(day.conditionType);
          const cardinal = cardinalToGerman(day.windCardinal);
          const windText = cardinal
            ? `${cardinal} (${Math.round(day.windSpeedKmh)} km/h)`
            : `${Math.round(day.windSpeedKmh)} km/h`;
          return (
            <View
              key={day.date.toISOString()}
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.borderSecondary },
              ]}
            >
              <View style={styles.cardBody}>
                <Text style={[styles.weekday, { color: colors.textSecondary }]}>
                  {dayLabel(day.date, index)}
                </Text>
                <View style={styles.tempRow}>
                  <Text style={[styles.bigTemp, { color: colors.textPrimary }]}>
                    {Math.round(day.maxC)}°
                  </Text>
                  <View style={styles.iconWrap}>
                    <Icon width={56} height={56} />
                  </View>
                </View>
                <Text style={[styles.range, { color: colors.textSecondary }]}>
                  {Math.round(day.minC)}° – {Math.round(day.maxC)}°
                </Text>
                <Text style={[styles.condition, { color: colors.textPrimary }]}>
                  {conditionText}
                </Text>
                <View style={[styles.metricsRow, { borderTopColor: colors.borderSecondary }]}>
                  <View style={styles.metric}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                      Wind
                    </Text>
                    <View style={styles.metricValue}>
                      <WindStatIcon width={16} height={16} />
                      <Text style={[styles.metricText, { color: colors.textPrimary }]}>
                        {windText}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.metric}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                      Niederschlag
                    </Text>
                    <View style={styles.metricValue}>
                      <RainStatIcon width={16} height={16} />
                      <Text style={[styles.metricText, { color: colors.textPrimary }]}>
                        {Math.round(day.precipitationProbability)} % /{' '}
                        {day.precipitationMm.toFixed(0)} mm
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardBody: {
    gap: 6,
  },
  weekday: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bigTemp: {
    fontSize: 40,
    fontFamily: 'Inter-Bold',
    lineHeight: 44,
  },
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  range: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  condition: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  metricsRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 24,
  },
  metric: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  metricValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
