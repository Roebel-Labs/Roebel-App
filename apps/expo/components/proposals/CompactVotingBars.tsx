import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { calculateVotePercentages } from '@/lib/governance-utils';

type Props = {
  forVotes: bigint | string;
  againstVotes: bigint | string;
  abstainVotes: bigint | string;
  showLabels?: boolean;
};

function toBigInt(v: bigint | string): bigint {
  if (typeof v === 'bigint') return v;
  try {
    return BigInt(v || '0');
  } catch {
    return 0n;
  }
}

export default function CompactVotingBars({
  forVotes,
  againstVotes,
  abstainVotes,
  showLabels = true,
}: Props) {
  const { colors } = useTheme();
  const percentages = calculateVotePercentages({
    forVotes: toBigInt(forVotes),
    againstVotes: toBigInt(againstVotes),
    abstainVotes: toBigInt(abstainVotes),
  });

  const totalPct =
    percentages.forPercent + percentages.againstPercent + percentages.abstainPercent;

  return (
    <View style={styles.container}>
      <View style={[styles.barRow, { borderColor: colors.border }]}>
        {totalPct === 0 ? (
          <View style={[styles.emptySegment, { backgroundColor: colors.border }]} />
        ) : (
          <>
            {percentages.forPercent > 0 && (
              <View
                style={[styles.segment, { flex: percentages.forPercent, backgroundColor: '#10B981' }]}
              />
            )}
            {percentages.againstPercent > 0 && (
              <View
                style={[styles.segment, { flex: percentages.againstPercent, backgroundColor: '#EF4444' }]}
              />
            )}
            {percentages.abstainPercent > 0 && (
              <View
                style={[styles.segment, { flex: percentages.abstainPercent, backgroundColor: colors.textSecondary }]}
              />
            )}
          </>
        )}
      </View>
      {showLabels && (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: '#10B981' }]}>
            Dafür {percentages.forPercent.toFixed(0)}%
          </Text>
          <Text style={[styles.label, { color: '#EF4444' }]}>
            Gegen {percentages.againstPercent.toFixed(0)}%
          </Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Enthaltung {percentages.abstainPercent.toFixed(0)}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  barRow: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
  },
  emptySegment: {
    flex: 1,
    height: '100%',
  },
  segment: {
    height: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
});
