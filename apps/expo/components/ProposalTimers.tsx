/**
 * Proposal Timers Component
 *
 * Displays a real-time countdown for the voting-delay and voting-period
 * windows.
 *
 * Reads the governor's own `clock()` rather than the chain's block height,
 * so it works regardless of whether the governor is in block-number mode
 * (legacy AttesterGovernor) or timestamp mode (current MACI Governor).
 *
 * For the current MACI Governor:
 *   CLOCK_MODE() = "mode=timestamp"
 *   clock(), proposalSnapshot(), proposalDeadline() all return Unix seconds.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useReadContract } from 'thirdweb/react';
import { readContract } from 'thirdweb';
import { governorContract } from '@/constants/thirdweb';
import { ProposalState } from '@/lib/governance-types';
import { useTheme } from '@/context/ThemeContext';

interface ProposalTimersProps {
  proposalId: bigint;
  proposalState: ProposalState;
}

// Base chain block time — only used as a unit conversion when the governor's
// CLOCK_MODE is block-number rather than timestamp.
const BLOCK_TIME_SECONDS = 2;

export default function ProposalTimers({ proposalId, proposalState }: ProposalTimersProps) {
  const [clockNow, setClockNow] = useState<bigint | null>(null);
  const [clockMode, setClockMode] = useState<'timestamp' | 'blocknumber'>('timestamp');
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const { colors } = useTheme();

  // Voting-window endpoints, in whatever unit CLOCK_MODE uses.
  const { data: snapshotClock } = useReadContract({
    contract: governorContract,
    method: 'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
    params: [proposalId],
    queryOptions: { enabled: !!proposalId },
  });

  const { data: deadlineClock } = useReadContract({
    contract: governorContract,
    method: 'function proposalDeadline(uint256 proposalId) view returns (uint256)',
    params: [proposalId],
    queryOptions: { enabled: !!proposalId },
  });

  // Detect mode once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mode = (await readContract({
          contract: governorContract,
          method: 'function CLOCK_MODE() view returns (string)',
          params: [],
        })) as string;
        if (cancelled) return;
        setClockMode(mode.includes('mode=blocknumber') ? 'blocknumber' : 'timestamp');
      } catch (err) {
        // CLOCK_MODE missing → assume legacy block-number governor.
        if (!cancelled) setClockMode('blocknumber');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the governor's own clock so the timer matches what the contract sees.
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const fetchClock = async () => {
      try {
        // uint48 returns as `number` in thirdweb's typegen; coerce to bigint
        // so it can be subtracted from snapshot/deadline (which are uint256).
        const raw = await readContract({
          contract: governorContract,
          method: 'function clock() view returns (uint48)',
          params: [],
        });
        const value = BigInt(raw as unknown as number | bigint | string);
        if (!cancelled) setClockNow(value);
      } catch (err) {
        console.warn('[ProposalTimers] clock() read failed:', err);
      }
    };

    fetchClock();
    interval = setInterval(fetchClock, 15000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  // Calculate time remaining.
  useEffect(() => {
    if (!snapshotClock || !deadlineClock || !clockNow) {
      setTimeRemaining('');
      return;
    }

    let unitsRemaining = 0n;
    if (proposalState === ProposalState.Pending) {
      unitsRemaining = snapshotClock - clockNow;
    } else if (proposalState === ProposalState.Active) {
      unitsRemaining = deadlineClock - clockNow;
    }

    if (unitsRemaining <= 0n) {
      setTimeRemaining('');
      return;
    }

    const secondsRemaining =
      clockMode === 'timestamp'
        ? Number(unitsRemaining)
        : Number(unitsRemaining) * BLOCK_TIME_SECONDS;

    setTimeRemaining(formatTimeRemaining(secondsRemaining));
  }, [clockNow, snapshotClock, deadlineClock, proposalState, clockMode]);

  // Format seconds into human-readable time.
  const formatTimeRemaining = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  // Don't show timer for completed/cancelled proposals.
  if (![ProposalState.Pending, ProposalState.Active].includes(proposalState)) {
    return null;
  }

  if (!timeRemaining || !snapshotClock || !deadlineClock) {
    return null;
  }

  const isPending = proposalState === ProposalState.Pending;

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {isPending ? 'Abstimmung startet in:' : 'Abstimmung endet in:'}
      </Text>
      <Text style={[styles.timeText, { color: colors.textPrimary }]}>{timeRemaining}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  timeText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
