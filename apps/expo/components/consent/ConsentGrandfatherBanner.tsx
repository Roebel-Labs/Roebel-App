/**
 * One-time inline banner shown to users who were grandfathered to "accept all"
 * because they had `terms_accepted_at` set before this granular consent system
 * existed. Pointed at the customize screen and dismissable forever.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useConsent } from '@/context/ConsentContext';
import { useTheme } from '@/context/ThemeContext';

export function ConsentGrandfatherBanner() {
  const { showGrandfatherBanner, dismissGrandfatherBanner } = useConsent();
  const { colors } = useTheme();
  const router = useRouter();

  if (!showGrandfatherBanner) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Du hast jetzt feinere Datenschutz-Einstellungen.
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Statistik, Fehlerprotokollierung, Mecky-KI, Karten und Push lassen sich jetzt einzeln steuern.
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/settings/consent' as any)}
          style={[styles.cta, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.ctaLabel, { color: colors.onPrimary }]}>Anpassen</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void dismissGrandfatherBanner();
          }}
          style={styles.dismiss}
          accessibilityLabel="Schließen"
        >
          <Text style={[styles.dismissLabel, { color: colors.textSecondary }]}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    gap: 12,
  },
  text: { gap: 4 },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  body: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cta: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  ctaLabel: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  dismiss: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLabel: {
    fontSize: 22,
    fontFamily: 'Inter-Regular',
  },
});
