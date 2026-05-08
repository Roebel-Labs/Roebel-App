import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { readContract } from 'thirdweb';
import { governorContract, getTallyContract } from '@/constants/thirdweb';
import { useTheme } from '@/context/ThemeContext';
import { toBigInt } from '@/lib/governance-utils';

interface VotingStatsProps {
  proposalId: bigint;
}

interface TallyState {
  loading: boolean;
  pollAddress: string | null;
  tallyAddress: string | null;
  isTallied: boolean;
  /** Governor returned no poll/tally for this proposalId — the proposal was
   *  created on a previous Governor (rotation) or the Supabase row is stale. */
  orphan: boolean;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const INITIAL_STATE: TallyState = {
  loading: true,
  pollAddress: null,
  tallyAddress: null,
  isTallied: false,
  orphan: false,
  forVotes: 0n,
  againstVotes: 0n,
  abstainVotes: 0n,
};

/**
 * Self-fetching tally display.
 *
 * Reads governor.proposalPolls(id) → Tally address. Until the coordinator
 * runs `proveOnChain`, Tally.isTallied() is false and we show empty bars
 * with a status caption. Once proven, fetches tallyResults(0/1/2) — these
 * are the canonical on-chain results, NOT a Supabase mirror — and renders
 * percentages.
 *
 * Vote-option indices match VoteType: 0=Against, 1=For, 2=Abstain.
 */
export default function VotingStats({ proposalId }: VotingStatsProps) {
  const { colors } = useTheme();
  const [state, setState] = useState<TallyState>(INITIAL_STATE);

  useEffect(() => {
    if (!proposalId || proposalId === 0n) {
      setState({ ...INITIAL_STATE, loading: false });
      return;
    }
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const polls = (await readContract({
          contract: governorContract,
          method:
            'function proposalPolls(uint256) view returns (uint256 pollId, address poll, address messageProcessor, address tally, uint256 deadline)',
          params: [proposalId],
        })) as readonly [bigint, string, string, string, bigint];
        const [, pollAddr, , tallyAddr] = polls;
        if (cancelled) return;
        if (!tallyAddr || tallyAddr.toLowerCase() === ZERO_ADDR) {
          setState({ ...INITIAL_STATE, loading: false, orphan: true });
          return;
        }
        const tally = getTallyContract(tallyAddr);
        const tallied = (await readContract({
          contract: tally,
          method: 'function isTallied() view returns (bool)',
          params: [],
        })) as boolean;
        if (cancelled) return;
        if (!tallied) {
          setState({
            loading: false,
            pollAddress: pollAddr,
            tallyAddress: tallyAddr,
            isTallied: false,
            orphan: false,
            forVotes: 0n,
            againstVotes: 0n,
            abstainVotes: 0n,
          });
          return;
        }
        // Vote-option order matches VoteType: 0=Against, 1=For, 2=Abstain.
        const [against, forR, abstain] = (await Promise.all([
          readContract({
            contract: tally,
            method: 'function tallyResults(uint256) view returns (uint256 value, bool flag)',
            params: [0n],
          }) as Promise<readonly [bigint, boolean]>,
          readContract({
            contract: tally,
            method: 'function tallyResults(uint256) view returns (uint256 value, bool flag)',
            params: [1n],
          }) as Promise<readonly [bigint, boolean]>,
          readContract({
            contract: tally,
            method: 'function tallyResults(uint256) view returns (uint256 value, bool flag)',
            params: [2n],
          }) as Promise<readonly [bigint, boolean]>,
        ]));
        if (cancelled) return;
        setState({
          loading: false,
          pollAddress: pollAddr,
          tallyAddress: tallyAddr,
          isTallied: true,
          orphan: false,
          forVotes: toBigInt(forR[0]),
          againstVotes: toBigInt(against[0]),
          abstainVotes: toBigInt(abstain[0]),
        });
      } catch (err) {
        console.warn('[VotingStats] fetch failed:', err);
        if (!cancelled) setState({ ...INITIAL_STATE, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  const total = state.forVotes + state.againstVotes + state.abstainVotes;
  const pct = (n: bigint): number => {
    if (total === 0n) return 0;
    // percentage with 0 decimals — total is small (numSignUps), so Number is safe
    return Number((n * 10000n) / total) / 100;
  };
  const forPct = pct(state.forVotes);
  const againstPct = pct(state.againstVotes);
  const abstainPct = pct(state.abstainVotes);

  // Hide the section entirely until either the tally has landed on chain OR
  // the proposal is on a deprecated Governor (orphan — explained inline). The
  // pre-tally caption ("encrypted votes will be decrypted") was visual noise:
  // VoteButtons already explains the same thing where the user actually
  // takes action.
  if (state.loading) return null;
  if (!state.isTallied && !state.orphan) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Wahlergebnisse</Text>
        {state.tallyAddress ? (
          <Pressable
            onPress={() => Linking.openURL(`https://basescan.org/address/${state.tallyAddress}`)}
            hitSlop={6}
          >
            <Text style={[styles.basescanLink, { color: colors.textSecondary }]}>
              On-chain prüfen ↗
            </Text>
          </Pressable>
        ) : null}
      </View>

      {state.orphan ? (
        <View style={[styles.statusCard, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            Diese Abstimmung gehört zu einem älteren Governor – Wahlergebnisse nicht verfügbar.
          </Text>
        </View>
      ) : null}

      <Bar
        label="Dafür"
        count={state.forVotes}
        percent={forPct}
        barColor="#10B981"
        colors={colors}
      />
      <Bar
        label="Gegen"
        count={state.againstVotes}
        percent={againstPct}
        barColor="#EF4444"
        colors={colors}
      />
      <Bar
        label="Enthaltung"
        count={state.abstainVotes}
        percent={abstainPct}
        barColor={colors.textSecondary}
        colors={colors}
      />
    </View>
  );
}

interface BarProps {
  label: string;
  count: bigint;
  percent: number;
  barColor: string;
  colors: ReturnType<typeof useTheme>['colors'];
}

function Bar({ label, count, percent, barColor, colors }: BarProps) {
  return (
    <View style={styles.voteRow}>
      <View style={styles.voteHeader}>
        <Text style={[styles.voteLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.votePercentage, { color: colors.textPrimary }]}>
          {percent.toFixed(0)}%
        </Text>
      </View>
      <View style={[styles.progressBarContainer, { borderColor: colors.border }]}>
        <View style={[styles.progressBar, { width: `${percent}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.voteCount, { color: colors.textSecondary }]}>{count.toString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginVertical: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  basescanLink: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textDecorationLine: 'underline',
  },
  statusCard: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
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
  progressBar: {
    height: '100%',
  },
  voteCount: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
