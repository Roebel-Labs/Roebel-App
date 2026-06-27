/**
 * Wraps a Mapbox-using subtree behind the maps_location consent gate.
 * Renders a placeholder card with an "Aktivieren" CTA when denied.
 *
 * Also disables Mapbox telemetry at module load regardless of consent — we
 * never want Mapbox phoning home with usage analytics that we haven't
 * separately disclosed.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Mapbox from '@rnmapbox/maps';
import { useConsent } from '@/context/ConsentContext';
import { useTheme } from '@/context/ThemeContext';

try {
  (Mapbox as unknown as { setTelemetryEnabled?: (enabled: boolean) => void }).setTelemetryEnabled?.(false);
} catch {
  // ignore on platforms that don't expose it
}

type Props = {
  children: React.ReactNode;
  /** Compact placeholder for inline use in a list. Default is full card. */
  variant?: 'card' | 'inline';
  height?: number;
};

export function ConditionalMapboxView({ children, variant = 'card', height = 240 }: Props) {
  const { preferences } = useConsent();
  const { colors } = useTheme();
  const router = useRouter();

  if (preferences.maps_location) return <>{children}</>;

  return (
    <View
      style={[
        styles.placeholder,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          height: variant === 'inline' ? 96 : height,
        },
      ]}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Karten sind deaktiviert
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
        Aktiviere „Karten & Standort" in den Datenschutz-Einstellungen, um Karten zu sehen.
      </Text>
      <Pressable
        onPress={() => router.push('/settings/consent' as any)}
        style={[styles.cta, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
      >
        <Text style={[styles.ctaLabel, { color: colors.onPrimary }]}>Aktivieren</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  body: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  cta: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  ctaLabel: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
