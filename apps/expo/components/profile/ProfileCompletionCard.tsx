/**
 * "Profil vervollständigen": the first-launch onboarding steps this person skipped, each tappable
 * into the same step UI (app/welcome/* in single-step mode, or edit-profile for the photo).
 * Renders nothing once everything is done. Works for thirdweb and passkey sessions alike.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';
import { completionProgress, missingProfileSteps } from '@/lib/profile-completion';
import type { UserRecord } from '@/lib/types';

export default function ProfileCompletionCard({ user }: { user: UserRecord | null }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const steps = missingProfileSteps(user);
  if (steps.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.background }, softShadow(2, isDark)]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Profil vervollständigen</Text>
        <Text style={[styles.progress, { color: colors.textSecondary }]}>{completionProgress(steps.length)}</Text>
      </View>
      {steps.map((step, i) => (
        <Pressable
          key={step.id}
          onPress={() => router.push(step.route as any)}
          accessibilityRole="button"
          accessibilityLabel={step.title}
          style={({ pressed }) => [
            styles.row,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[styles.dot, { borderColor: colors.primary }]} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{step.title}</Text>
            <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{step.subtitle}</Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 16, marginTop: 16 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 18, lineHeight: 24 },
  progress: { fontFamily: fontFamily.regular, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20 },
  rowSubtitle: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  chevron: { fontFamily: fontFamily.regular, fontSize: 24, lineHeight: 26 },
});
