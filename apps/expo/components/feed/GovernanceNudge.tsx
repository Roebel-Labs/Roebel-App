import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

interface GovernanceNudgeProps {
  proposalId: string;
  title: string;
  forPercentage: number;
  againstPercentage: number;
  daysRemaining: number;
}

export default function GovernanceNudge({
  proposalId,
  title,
  forPercentage,
  againstPercentage,
  daysRemaining,
}: GovernanceNudgeProps) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/proposal/${proposalId}` as any)}
      style={[styles.container, { backgroundColor: colors.primaryLight, borderLeftColor: colors.primary }]}
    >
      <Text style={[styles.label, { color: colors.primary }]}>
        🗳️ ABSTIMMUNG · endet in {daysRemaining} {daysRemaining === 1 ? 'Tag' : 'Tagen'}
      </Text>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.barRow}>
        <View style={[styles.bar, styles.forBar, { flex: forPercentage, backgroundColor: colors.successBackground }]}>
          <Text style={[styles.barText, { color: colors.success }]}>✅ {forPercentage}%</Text>
        </View>
        <View style={[styles.bar, styles.againstBar, { flex: againstPercentage, backgroundColor: colors.errorBackground }]}>
          <Text style={[styles.barText, { color: colors.error }]}>❌ {againstPercentage}%</Text>
        </View>
      </View>
      <View style={[styles.ctaButton, { backgroundColor: colors.primary }]}>
        <Text style={styles.ctaText}>Jetzt abstimmen · +50 Punkte</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    borderLeftWidth: 3,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    marginTop: 4,
  },
  barRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  bar: {
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 60,
  },
  forBar: {},
  againstBar: {},
  barText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  ctaButton: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
});
