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

  return (
    <Pressable onPress={handlePress} style={[styles.container, { borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textTertiary }]}>VORSCHLAG</Text>
        <ProposalStateBadge state={proposal.state as ProposalState} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {proposal.title}
      </Text>
      <CompactVotingBars
        forVotes={proposal.for_votes}
        againstVotes={proposal.against_votes}
        abstainVotes={proposal.abstain_votes}
      />
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
