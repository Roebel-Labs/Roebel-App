import React from 'react';
import { View, Text, ImageBackground, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import RainStatIcon from '@/assets/icons/weather-stats/rain.svg';
import WindStatIcon from '@/assets/icons/weather-stats/fast-wind.svg';
import {
  cardinalToGerman,
  getWeatherIcon,
  getWeatherIllustration,
  type CurrentWeather,
  type DailyEntry,
} from '@/lib/weather';

type Props = {
  current: CurrentWeather;
  today: DailyEntry | null;
};

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} Uhr`;
}

function sunHours(sunrise: string | null, sunset: string | null): string {
  if (!sunrise || !sunset) return '—';
  const ms = new Date(sunset).getTime() - new Date(sunrise).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export default function CurrentWeatherCard({ current, today }: Props) {
  const { colors, isDark } = useTheme();

  const illustration = getWeatherIllustration(
    current.conditionType,
    current.precipitationProbability,
  );
  const ConditionIcon = getWeatherIcon(current.conditionType, current.precipitationProbability);
  const overlayColor = isDark ? 'rgba(20,22,26,0.55)' : 'rgba(255,255,255,0.55)';

  const highLow =
    today && Number.isFinite(today.maxC) && Number.isFinite(today.minC)
      ? `Heute: ${Math.round(today.minC)}° – ${Math.round(today.maxC)}°`
      : null;

  const stats: { key: string; label: string; value: string; icon: React.ReactNode }[] = [
    {
      key: 'sunrise',
      label: 'Sonnenaufgang',
      value: formatTime(today?.sunriseTime ?? null),
      icon: <Ionicons name="arrow-up" size={18} color={colors.textPrimary} />,
    },
    {
      key: 'sunset',
      label: 'Sonnenuntergang',
      value: formatTime(today?.sunsetTime ?? null),
      icon: <Ionicons name="arrow-down" size={18} color={colors.textPrimary} />,
    },
    {
      key: 'sunhours',
      label: 'Sonnenstunden',
      value: sunHours(today?.sunriseTime ?? null, today?.sunsetTime ?? null),
      icon: <Ionicons name="sunny-outline" size={18} color={colors.textPrimary} />,
    },
    {
      key: 'humidity',
      label: 'Luftfeuchtigkeit',
      value: `${Math.round(current.humidity)}%`,
      icon: <Ionicons name="water-outline" size={18} color={colors.textPrimary} />,
    },
    {
      key: 'pressure',
      label: 'Luftdruck',
      value:
        current.pressureHpa != null ? `${Math.round(current.pressureHpa)} hPa` : '—',
      icon: <Ionicons name="speedometer-outline" size={18} color={colors.textPrimary} />,
    },
  ];

  const cardinal = cardinalToGerman(current.windCardinal);
  const windText = cardinal
    ? `${cardinal} bis ${Math.round(current.windSpeedKmh)} km/h`
    : `${Math.round(current.windSpeedKmh)} km/h`;

  return (
    <ImageBackground
      source={illustration}
      style={styles.card}
      imageStyle={styles.cardImage}
      resizeMode="cover"
    >
      <View style={[styles.overlay, { backgroundColor: overlayColor }]} />

      <Text style={[styles.kicker, { color: colors.textPrimary }]}>Aktuelles Wetter</Text>

      <View style={styles.tempRow}>
        <Text style={[styles.temp, { color: colors.textPrimary }]}>
          {Math.round(current.tempC)}°C
        </Text>
        <ConditionIcon width={40} height={40} />
      </View>

      {highLow && (
        <Text style={[styles.subline, { color: colors.textSecondary }]}>{highLow}</Text>
      )}

      {!!current.conditionText && (
        <Text style={[styles.condition, { color: colors.textPrimary }]}>
          {current.conditionText}.
        </Text>
      )}

      <View style={styles.inlineRow}>
        <RainStatIcon width={16} height={16} />
        <Text style={[styles.inlineText, { color: colors.textPrimary }]}>
          {Math.round(current.precipitationProbability)} % · bis{' '}
          {current.precipitationMm.toFixed(0)} mm
        </Text>
      </View>

      <View style={styles.inlineRow}>
        <WindStatIcon width={16} height={16} />
        <Text style={[styles.inlineText, { color: colors.textPrimary }]}>{windText}</Text>
      </View>

      <View style={[styles.statsBox, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
        {stats.map((stat, index) => (
          <View
            key={stat.key}
            style={[
              styles.statRow,
              index < stats.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.borderSecondary,
              },
            ]}
          >
            <View style={styles.statLabel}>
              {stat.icon}
              <Text style={[styles.statLabelText, { color: colors.textSecondary }]}>
                {stat.label}
              </Text>
            </View>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stat.value}</Text>
          </View>
        ))}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 16,
    minHeight: 320,
  },
  cardImage: {
    borderRadius: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  kicker: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  temp: {
    fontSize: 56,
    fontFamily: 'Inter-Bold',
    lineHeight: 60,
  },
  subline: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  condition: {
    marginTop: 16,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  inlineText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  statsBox: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  statRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabelText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  statValue: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
