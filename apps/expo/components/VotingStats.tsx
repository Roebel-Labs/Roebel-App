import React from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useProposalTally } from '@/hooks/useProposalTally';

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

  const nowSec = Math.floor(Date.now() / 1000);
  const votingEnded = tally.deadlineSec !== null && nowSec >= tally.deadlineSec;
  const showPendingTally = !tally.published && !tally.orphan && votingEnded;
  const visible = tally.published || tally.orphan || showPendingTally;
  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Heading + bars + total render ONLY once results are published. */}
      {tally.published ? (
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Wahlergebnisse</Text>
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
            Wahlergebnis wird berechnet. Der Koordinator entschlüsselt die Stimmen
            und veröffentlicht das Ergebnis innerhalb von ca. 15 Minuten auf der
            Blockchain – diese Seite aktualisiert sich automatisch.
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
