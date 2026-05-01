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
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Wahlergebnisse</Text>

      {/* Dafür (For) */}
      <View style={styles.voteRow}>
        <View style={styles.voteHeader}>
          <Text style={[styles.voteLabel, { color: colors.textPrimary }]}>Dafür</Text>
          <Text style={[styles.votePercentage, { color: colors.textPrimary }]}>{percentages.forPercent.toFixed(0)}%</Text>
        </View>
        <View style={[styles.progressBarContainer, { borderColor: colors.border }]}>
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
        <View style={[styles.progressBarContainer, { borderColor: colors.border }]}>
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
        <View style={[styles.progressBarContainer, { borderColor: colors.border }]}>
          <View
            style={[
              styles.progressBarAbstain,
              { width: `${percentages.abstainPercent}%`, backgroundColor: colors.textSecondary },
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginVertical: 16,
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
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
    borderWidth: 1,
  },
  progressBarFor: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  progressBarAgainst: {
    height: '100%',
    backgroundColor: '#EF4444',
  },
  progressBarAbstain: {
    height: '100%',
  },
  voteCount: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
