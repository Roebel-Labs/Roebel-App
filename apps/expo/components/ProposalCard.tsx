import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Proposal } from '@/lib/governance-types';
import { shortenAddress, calculateVotePercentages, calculateReadingTime } from '@/lib/governance-utils';
import { useTheme } from '@/context/ThemeContext';
import ProposalStateBadge from './ProposalStateBadge';

interface ProposalCardProps {
  proposal: Proposal;
}

export default function ProposalCard({ proposal }: ProposalCardProps) {
  const router = useRouter();
  const { colors } = useTheme();

  const handlePress = () => {
    // Use Supabase UUID for routing (required for details page)
    const routeId = proposal.supabaseId || proposal.proposalId.toString();
    router.push(`/proposal/${routeId}`);
  };

  const votePercentages = calculateVotePercentages({
    forVotes: proposal.forVotes,
    againstVotes: proposal.againstVotes,
    abstainVotes: proposal.abstainVotes,
  });

  // Calculate reading time from summary or description
  const content = proposal.summary || proposal.description;
  const readingTime = calculateReadingTime(content);

  // Format date in German
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('de-DE', { month: 'short' });
    const year = date.getFullYear();
    return `${day}. ${month} ${year}`;
  };

  return (
    <Pressable onPress={handlePress} style={[styles.card, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}>
      {/* Status Badge — proposalId makes the badge poll governor.state() live */}
      <ProposalStateBadge state={proposal.state} proposalId={proposal.proposalId} />

      {/* Title */}
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {proposal.title || proposal.description}
      </Text>

      {/* Metadata Row */}
      <View style={styles.metadataRow}>
        <Text style={[styles.metadataText, { color: colors.textSecondary }]}>
          von {shortenAddress(proposal.proposer)}
        </Text>
        {proposal.createdAt && (
          <>
            <Text style={[styles.separator, { color: colors.textTertiary }]}>•</Text>
            <Text style={[styles.metadataText, { color: colors.textSecondary }]}>
              {formatDate(proposal.createdAt)}
            </Text>
          </>
        )}
        <Text style={[styles.separator, { color: colors.textTertiary }]}>•</Text>
        <Text style={[styles.metadataText, { color: colors.textSecondary }]}>
          {readingTime} min read
        </Text>
      </View>

      {/* Vote Progress Bar (only show if votes exist) */}
      {votePercentages.totalVotes > 0n && (
        <View style={styles.voteSection}>
          <View style={[styles.progressBarContainer, { backgroundColor: colors.surfaceSecondary }]}>
            <View
              style={[
                styles.progressBarFor,
                { width: `${votePercentages.forPercent}%` },
              ]}
            />
            <View
              style={[
                styles.progressBarAgainst,
                { width: `${votePercentages.againstPercent}%` },
              ]}
            />
          </View>
          <View style={styles.voteStats}>
            <Text style={[styles.voteStatsText, { color: colors.textSecondary }]}>
              Dafür: {votePercentages.forPercent.toFixed(1)}%
            </Text>
            <Text style={[styles.voteStatsText, { color: colors.textSecondary }]}>
              Dagegen: {votePercentages.againstPercent.toFixed(1)}%
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginTop: 12,
    marginBottom: 12,
    lineHeight: 24,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
    flexWrap: 'wrap',
  },
  metadataText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  separator: {
    fontSize: 12,
  },
  voteSection: {
    marginTop: 4,
  },
  progressBarContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFor: {
    backgroundColor: '#10B981',
    height: '100%',
  },
  progressBarAgainst: {
    backgroundColor: '#EF4444',
    height: '100%',
  },
  voteStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  voteStatsText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
});
