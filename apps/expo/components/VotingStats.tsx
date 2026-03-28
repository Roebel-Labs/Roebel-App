import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProposalVotes } from '@/lib/governance-types';
import { calculateVotePercentages, formatBigInt } from '@/lib/governance-utils';
import { useTheme } from '@/context/ThemeContext';

interface VotingStatsProps {
  votes: ProposalVotes;
}

export default function VotingStats({ votes }: VotingStatsProps) {
  const percentages = calculateVotePercentages(votes);
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Wahlergebnisse</Text>

      {/* Dafür (For) */}
      <View style={styles.voteRow}>
        <View style={styles.voteHeader}>
          <Text style={[styles.voteLabel, { color: colors.textPrimary }]}>Dafür</Text>
          <Text style={[styles.votePercentage, { color: colors.textPrimary }]}>{percentages.forPercent.toFixed(0)}%</Text>
        </View>
        <View style={[styles.progressBarContainer, { backgroundColor: colors.surfaceSecondary }]}>
          <View
            style={[
              styles.progressBarFor,
              { width: `${percentages.forPercent}%` },
            ]}
          />
        </View>
        <Text style={[styles.voteCount, { color: colors.textSecondary }]}>{formatBigInt(votes.forVotes)}</Text>
      </View>

      {/* Dagegen (Against) */}
      <View style={styles.voteRow}>
        <View style={styles.voteHeader}>
          <Text style={[styles.voteLabel, { color: colors.textPrimary }]}>Gegen</Text>
          <Text style={[styles.votePercentage, { color: colors.textPrimary }]}>{percentages.againstPercent.toFixed(0)}%</Text>
        </View>
        <View style={[styles.progressBarContainer, { backgroundColor: colors.surfaceSecondary }]}>
          <View
            style={[
              styles.progressBarAgainst,
              { width: `${percentages.againstPercent}%` },
            ]}
          />
        </View>
        <Text style={[styles.voteCount, { color: colors.textSecondary }]}>{formatBigInt(votes.againstVotes)}</Text>
      </View>

      {/* Enthaltung (Abstain) */}
      <View style={styles.voteRow}>
        <View style={styles.voteHeader}>
          <Text style={[styles.voteLabel, { color: colors.textPrimary }]}>Enthaltung</Text>
          <Text style={[styles.votePercentage, { color: colors.textPrimary }]}>{percentages.abstainPercent.toFixed(0)}%</Text>
        </View>
        <View style={[styles.progressBarContainer, { backgroundColor: colors.surfaceSecondary }]}>
          <View
            style={[
              styles.progressBarAbstain,
              { width: `${percentages.abstainPercent}%` },
            ]}
          />
        </View>
        <Text style={[styles.voteCount, { color: colors.textSecondary }]}>{formatBigInt(votes.abstainVotes)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 20,
  },
  voteRow: {
    marginBottom: 20,
  },
  voteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  voteLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  votePercentage: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  progressBarContainer: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFor: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  progressBarAgainst: {
    height: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 3,
  },
  progressBarAbstain: {
    height: '100%',
    backgroundColor: '#9CA3AF',
    borderRadius: 3,
  },
  voteCount: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
