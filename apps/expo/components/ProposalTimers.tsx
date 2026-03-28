/**
 * Proposal Timers Component
 *
 * Displays real-time countdown timers for voting delay and voting period
 * - Voting Delay: 43200 blocks = 1 day (time until voting starts)
 * - Voting Period: 216000 blocks = 5 days (time until voting ends)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useReadContract } from 'thirdweb/react';
import { readContract, eth_blockNumber } from 'thirdweb';
import { governorContract, client } from '@/constants/thirdweb';
import { ProposalState } from '@/lib/governance-types';
import { base } from 'thirdweb/chains';
import { getRpcClient } from 'thirdweb/rpc';
import { useTheme } from '@/context/ThemeContext';

interface ProposalTimersProps {
  proposalId: bigint;
  proposalState: ProposalState;
}

// Base chain block time: ~2 seconds per block
const BLOCK_TIME_SECONDS = 2;
const VOTING_DELAY_BLOCKS = 43200; // 1 day
const VOTING_PERIOD_BLOCKS = 216000; // 5 days

export default function ProposalTimers({ proposalId, proposalState }: ProposalTimersProps) {
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const { colors } = useTheme();

  // Get proposal snapshot (start block + delay)
  const { data: snapshotBlock } = useReadContract({
    contract: governorContract,
    method: 'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
    params: [proposalId],
    queryOptions: { enabled: !!proposalId },
  });

  // Get proposal deadline (end block)
  const { data: deadlineBlock } = useReadContract({
    contract: governorContract,
    method: 'function proposalDeadline(uint256 proposalId) view returns (uint256)',
    params: [proposalId],
    queryOptions: { enabled: !!proposalId },
  });

  // Poll current block number using thirdweb RPC
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchCurrentBlock = async () => {
      try {
        const rpcRequest = getRpcClient({ client, chain: base });
        const blockNumber = await eth_blockNumber(rpcRequest);
        setCurrentBlock(blockNumber);
      } catch (error) {
        console.error('Error fetching current block:', error);
      }
    };

    fetchCurrentBlock();
    // Update every 15 seconds
    interval = setInterval(fetchCurrentBlock, 15000);

    return () => clearInterval(interval);
  }, []);

  // Calculate time remaining
  useEffect(() => {
    if (!snapshotBlock || !deadlineBlock || !currentBlock) return;

    let blocksRemaining = 0n;
    let phase = '';

    // Pending state - voting hasn't started yet (voting delay period)
    // Note: proposalSnapshot() returns the block when voting STARTS (not creation block)
    // So snapshotBlock already includes the voting delay
    if (proposalState === ProposalState.Pending) {
      blocksRemaining = snapshotBlock - currentBlock;
      phase = 'delay';
    }
    // Active state - voting is ongoing
    else if (proposalState === ProposalState.Active) {
      blocksRemaining = deadlineBlock - currentBlock;
      phase = 'voting';
    }

    if (blocksRemaining <= 0n) {
      setTimeRemaining('');
      return;
    }

    const secondsRemaining = Number(blocksRemaining) * BLOCK_TIME_SECONDS;
    const formatted = formatTimeRemaining(secondsRemaining);
    setTimeRemaining(formatted);
  }, [currentBlock, snapshotBlock, deadlineBlock, proposalState]);

  // Format seconds into human-readable time
  const formatTimeRemaining = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Calculate progress percentage
  const getProgress = (): number => {
    if (!snapshotBlock || !deadlineBlock || !currentBlock) return 0;

    if (proposalState === ProposalState.Pending) {
      const votingStartBlock = snapshotBlock + BigInt(VOTING_DELAY_BLOCKS);
      const totalBlocks = VOTING_DELAY_BLOCKS;
      const elapsed = Number(currentBlock - snapshotBlock);
      return Math.min((elapsed / totalBlocks) * 100, 100);
    } else if (proposalState === ProposalState.Active) {
      const votingStartBlock = snapshotBlock + BigInt(VOTING_DELAY_BLOCKS);
      const totalBlocks = VOTING_PERIOD_BLOCKS;
      const elapsed = Number(currentBlock - votingStartBlock);
      return Math.min((elapsed / totalBlocks) * 100, 100);
    }

    return 0;
  };

  // Don't show timer for completed/cancelled proposals
  if (![ProposalState.Pending, ProposalState.Active].includes(proposalState)) {
    return null;
  }

  if (!timeRemaining || !snapshotBlock || !deadlineBlock) {
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
