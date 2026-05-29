import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { readContract } from 'thirdweb';
import { governorContract } from '@/constants/thirdweb';
import { ProposalState } from '@/lib/governance-types';
import { getProposalStateName, getProposalStateColor } from '@/lib/governance-utils';

interface ProposalStateBadgeProps {
  /** Cached state from Supabase (or wherever). Used as the initial render so
   *  we don't flash an empty badge while the chain read is in flight. */
  state: ProposalState;
  /** When set, the badge polls governor.state(proposalId) every 30 s and
   *  uses that as the source of truth. The cached prop becomes the fallback
   *  for the brief window before the first chain read returns. */
  proposalId?: bigint;
  /** Smaller tag variant for dense list cards (e.g. the Stadt-tab feed card). */
  compact?: boolean;
}

const POLL_INTERVAL_MS = 30_000;

export default function ProposalStateBadge({ state, proposalId, compact = false }: ProposalStateBadgeProps) {
  const [liveState, setLiveState] = useState<ProposalState>(state);

  // Re-sync to fallback when the parent's state prop changes (e.g. after a
  // refetch from Supabase) so we don't get stuck on a stale chain read.
  useEffect(() => {
    setLiveState(state);
  }, [state]);

  useEffect(() => {
    if (!proposalId || proposalId === 0n) return;
    let cancelled = false;
    const fetchState = async () => {
      try {
        const raw = await readContract({
          contract: governorContract,
          method: 'function state(uint256 proposalId) view returns (uint8)',
          params: [proposalId],
        });
        if (cancelled) return;
        const numeric = Number(raw);
        if (!Number.isNaN(numeric)) setLiveState(numeric as ProposalState);
      } catch (err) {
        // Don't spam logs — the badge falls back to the cached state. The
        // most common failure here is "proposal doesn't exist on this
        // Governor" (orphan), which is already surfaced elsewhere.
        console.warn('[ProposalStateBadge] state() read failed:', err);
      }
    };
    fetchState();
    const id = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [proposalId]);

  const stateName = getProposalStateName(liveState);
  const colors = getProposalStateColor(liveState);

  return (
    <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: colors.background }]}>
      <Text style={[styles.badgeText, compact && styles.badgeTextCompact, { color: colors.text }]}>
        {stateName}
      </Text>
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
  badgeCompact: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 9999,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeTextCompact: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
});
