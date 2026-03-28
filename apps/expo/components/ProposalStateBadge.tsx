import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProposalState } from '@/lib/governance-types';
import { getProposalStateName, getProposalStateColor } from '@/lib/governance-utils';

interface ProposalStateBadgeProps {
  state: ProposalState;
}

export default function ProposalStateBadge({ state }: ProposalStateBadgeProps) {
  const stateName = getProposalStateName(state);
  const colors = getProposalStateColor(state);

  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{stateName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
