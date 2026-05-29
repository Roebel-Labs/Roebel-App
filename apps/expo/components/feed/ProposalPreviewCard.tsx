import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import ProposalStateBadge from '@/components/ProposalStateBadge';
import CompactVotingBars from '@/components/proposals/CompactVotingBars';
import type { ProposalState } from '@/lib/governance-types';
import type { ProposalPreviewRef } from '@/lib/types/feed';

type Props = {
  proposal: ProposalPreviewRef;
};

export default function ProposalPreviewCard({ proposal }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const handlePress = () => {
    router.push(`/proposal/${proposal.proposal_id}` as any);
  };

  // Supabase vote columns only populate once the tally is published, so a
  // non-zero total is the "results published" gate — keeps unpublished results
  // out of the comment preview.
  const toBig = (v: string): bigint => {
    try {
      return BigInt(v || '0');
    } catch {
      return 0n;
    }
  };
  const resultsPublished =
    toBig(proposal.for_votes) + toBig(proposal.against_votes) + toBig(proposal.abstain_votes) > 0n;

  return (
    <Pressable onPress={handlePress} style={[styles.container, { borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textTertiary }]}>VORSCHLAG</Text>
        <ProposalStateBadge state={proposal.state as ProposalState} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {proposal.title}
      </Text>
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
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 20,
  },
});
