import React from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useProposalTally } from '@/hooks/useProposalTally';
import { ProposalState } from '@/lib/governance-types';

interface VotingStatsProps {
  proposalId: bigint;
}

/**
 * Self-fetching tally display, backed by useProposalTally (governor.proposalPolls
 * → Tally.isTallied() → tallyResults(0/1/2)). These are the canonical on-chain
 * results, NOT a Supabase mirror.
 *
 * Render modes:
 *   • Published  → "Wahlergebnisse" heading + percentage bars + total + on-chain link.
 *   • Calculating (voting ended, not yet tallied) → ONLY the "wird berechnet"
 *     caption. The heading/bars/total stay hidden until results are published.
 *   • Orphan (proposal on a deprecated Governor) → explanatory caption only.
 *   • Active vote (deadline still ahead, not tallied) → hidden entirely.
 */
export default function VotingStats({ proposalId }: VotingStatsProps) {
  const { colors } = useTheme();
  const tally = useProposalTally(proposalId);

  const total = tally.total;
  const pct = (n: bigint): number => {
    if (total === 0n) return 0;
    return Number((n * 10000n) / total) / 100;
  };

  if (tally.loading) return null;

  // Prefer the live governor state: while a vote is open (Pending/Active) we show
  // nothing — the MACI poll deadline can lapse before the proposal leaves its
  // Active window, so a deadline-only gate leaked the section into active votes.
  // Fall back to the deadline check only when state() couldn't be read.
  const nowSec = Math.floor(Date.now() / 1000);
  const votingEndedByDeadline = tally.deadlineSec !== null && nowSec >= tally.deadlineSec;
  const ended =
    tally.state !== null
      ? tally.state !== ProposalState.Pending && tally.state !== ProposalState.Active
      : votingEndedByDeadline;

  // Results render ONLY after the voting window closed AND the decrypted
  // tally landed on-chain. During an open vote nothing shows — not even
  // empty bars. (Belt-and-suspenders with the hook's totalTallyResults
  // gate: a stale/cached "published" can never leak into an active vote.)
  const showResults = tally.published && ended;
  const showPendingTally = !showResults && !tally.orphan && ended;
  const visible = showResults || tally.orphan || showPendingTally;
  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Heading + bars + total render ONLY once results are published. */}
      {showResults ? (
        <>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Wahlergebnisse</Text>
              {/* Published = the tally was ZK-proven on-chain. Mirrors the
                  admin dashboard's "✓ Ausgezählt" badge so citizens see the
                  same signal: these numbers are final and verifiable. */}
              <View style={styles.talliedBadge}>
                <Text style={styles.talliedBadgeText}>✓ Ausgezählt</Text>
              </View>
            </View>
            {tally.tallyAddress ? (
              <Pressable
                onPress={() => Linking.openURL(`https://basescan.org/address/${tally.tallyAddress}`)}
                hitSlop={6}
              >
                <Text style={[styles.basescanLink, { color: colors.textSecondary }]}>
                  On-chain prüfen ↗
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Bar
            label="Dafür"
            count={tally.forVotes}
            percent={pct(tally.forVotes)}
            barColor="#10B981"
            colors={colors}
          />
          <Bar
            label="Gegen"
            count={tally.againstVotes}
            percent={pct(tally.againstVotes)}
            barColor="#EF4444"
            colors={colors}
          />
          <Bar
            label="Enthaltung"
            count={tally.abstainVotes}
            percent={pct(tally.abstainVotes)}
            barColor={colors.textSecondary}
            colors={colors}
          />

          <Text style={[styles.totalLine, { color: colors.textSecondary }]}>
            Gesamtstimmen: {total.toString()}
          </Text>
        </>
      ) : null}

      {tally.orphan ? (
        <View style={[styles.statusCard, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            Diese Abstimmung gehört zu einem älteren Governor – Wahlergebnisse nicht verfügbar.
          </Text>
        </View>
      ) : null}

      {showPendingTally ? (
        <View style={[styles.statusCard, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            Die Abstimmung ist beendet — die digitale Wahlurne wird geöffnet.
            Dafür schließen mehrere Schlüsselhalter:innen aus Röbel gemeinsam
            auf; keine:r kann das allein. Das geprüfte Ergebnis erscheint hier
            automatisch.
          </Text>
        </View>
      ) : null}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  talliedBadge: {
    backgroundColor: '#10B981',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  talliedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
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
  totalLine: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginTop: 4,
  },
});
