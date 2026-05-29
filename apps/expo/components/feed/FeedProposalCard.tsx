import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import ProposalStateBadge from '@/components/ProposalStateBadge';
import CompactVotingBars from '@/components/proposals/CompactVotingBars';
import { shortenAddress } from '@/lib/governance-utils';
import type { ProposalFeedRecord } from '@/lib/types/feed';
import type { ProposalState } from '@/lib/governance-types';

type Props = {
  proposal: ProposalFeedRecord;
};

export default function FeedProposalCard({ proposal }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const handlePress = () => {
    router.push(`/proposal/${proposal.proposal_id}` as any);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('de-DE', { month: 'short' });
    return `${day}. ${month}`;
  };

  // Supabase vote columns are populated only after the tally is published on
  // chain, so a non-zero total is a safe "results published" proxy here — it
  // avoids a per-row MACI tally read inside the feed list.
  const toBig = (v: string): bigint => {
    try {
      return BigInt(v || '0');
    } catch {
      return 0n;
    }
  };
  const resultsPublished =
    toBig(proposal.for_votes) + toBig(proposal.against_votes) + toBig(proposal.abstain_votes) > 0n;

  let blockchainId: bigint | undefined;
  try {
    blockchainId = proposal.blockchain_proposal_id
      ? BigInt(proposal.blockchain_proposal_id)
      : undefined;
  } catch {
    blockchainId = undefined;
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.primary }]}>BÜRGERUMFRAGE</Text>
        <ProposalStateBadge state={proposal.state as ProposalState} proposalId={blockchainId} compact />
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {proposal.title}
      </Text>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          von {shortenAddress(proposal.proposer_address)}
        </Text>
        <Text style={[styles.dot, { color: colors.textTertiary }]}>·</Text>
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          {formatDate(proposal.created_at)}
        </Text>
      </View>

      {resultsPublished && (
        <CompactVotingBars
          forVotes={proposal.for_votes}
          againstVotes={proposal.against_votes}
          abstainVotes={proposal.abstain_votes}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  dot: {
    fontSize: 12,
  },
});
