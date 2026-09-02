import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { isDeliberateDebatesEnabled } from '@/lib/supabase-app-settings';
import { readDebate, type DebateSummary } from '@/lib/deliberate/chain';
import { approvalPercent } from '@/lib/deliberate/protocol';
import { readContract } from 'thirdweb';
import { deliberateReadContract } from '@/constants/deliberate';

type Props = {
  debateId: number;
};

type StripData = {
  summary: DebateSummary;
  rootApproval: number;
};

function phaseLabel(summary: DebateSummary): string {
  switch (summary.phase) {
    case 'editing':
      return 'Bearbeitung läuft';
    case 'rating':
      return 'Bewertung läuft';
    case 'tallying':
      return 'Auszählung ausstehend';
    case 'finished':
      return summary.approved ? 'Meinungsbild: angenommen' : 'Meinungsbild: abgelehnt';
  }
}

/**
 * One-line entry pill into a thread's structured debate. Renders nothing while
 * the feature flag is off, the debate is loading, or it does not exist.
 */
export default function DebateStrip({ debateId }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const { data: enabled } = useQuery({
    queryKey: ['flags', 'deliberate'],
    queryFn: isDeliberateDebatesEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data } = useQuery<StripData | null>({
    queryKey: ['debate', debateId, 'strip'],
    enabled: enabled === true,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const summary = await readDebate(debateId);
      if (!summary) return null;
      const thesis = await readContract({
        contract: deliberateReadContract,
        method:
          'function getArgument(uint256, uint16) view returns ((bytes32 contentURI, address creator, bool isSupporting, uint16 parentArgumentId, uint16 untalliedChilds, uint48 finalizationTime, uint32 pro, uint32 con, uint32 votes, uint32 subtreeVotes, int64 descendantsAggregate, int64 rating, int88 centeredApprovalSeconds, uint80 votesSeconds, uint48 lastAccrualTime, uint32 fees))',
        params: [BigInt(debateId), 0],
      });
      return { summary, rootApproval: approvalPercent(Number(thesis.pro), Number(thesis.con)) };
    },
  });

  if (!enabled || !data) return null;

  const { summary, rootApproval } = data;

  return (
    <Pressable
      onPress={() => router.push(`/forum/debate/${debateId}` as any)}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Zur strukturierten Debatte"
      style={({ pressed }) => [
        styles.strip,
        { borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: summary.phase === 'finished' ? colors.textTertiary : colors.primary }]} />
      <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>
        Debatte · {phaseLabel(summary)}
      </Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
        {summary.participantsCount} Teiln. · {rootApproval}{' '}%
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    flexShrink: 1,
  },
  meta: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
  },
});
