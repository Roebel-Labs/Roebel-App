/**
 * Soft contextual nudge shown inline by category-specific screens (Mecky tab,
 * map screens) when that category is denied AND we haven't exceeded the
 * dismissal cap.
 *
 * Usage:
 *   <ConsentReminderBanner
 *     category="ai_assistant"
 *     headline="Mecky braucht deine Zustimmung"
 *     body="Aktiviere den KI-Assistenten, um zu chatten."
 *   />
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useConsent } from '@/context/ConsentContext';
import { useTheme } from '@/context/ThemeContext';
import type { ConsentCategoryId } from '@/constants/consent';

type Props = {
  category: ConsentCategoryId;
  headline: string;
  body: string;
};

export function ConsentReminderBanner({ category, headline, body }: Props) {
  const { shouldShowContextualBanner, recordContextualDismiss, setPreference } = useConsent();
  const { colors } = useTheme();
  const router = useRouter();

  if (!shouldShowContextualBanner(category)) return null;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.primaryLight, borderColor: colors.primary },
      ]}
    >
      <View style={styles.textColumn}>
        <Text style={[styles.headline, { color: colors.primary }]}>{headline}</Text>
        <Text style={[styles.body, { color: colors.textPrimary }]}>{body}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={async () => {
            await setPreference(category, true, 'banner');
          }}
          style={[styles.primaryAction, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>Aktivieren</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/consent' as any)}
          style={styles.secondaryAction}
          accessibilityRole="link"
        >
          <Text style={[styles.secondaryLabel, { color: colors.primary }]}>Anpassen</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void recordContextualDismiss(category);
          }}
          style={styles.dismissAction}
          accessibilityRole="button"
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
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    margin: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textColumn: {
    gap: 4,
  },
  headline: {
    fontSize: 14,
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
  primaryAction: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  primaryLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  secondaryAction: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  dismissAction: {
    marginLeft: 'auto',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLabel: {
    fontSize: 22,
    lineHeight: 24,
    fontFamily: 'Inter-Regular',
  },
});
