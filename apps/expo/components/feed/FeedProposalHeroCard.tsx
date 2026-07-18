import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchProposals, type SupabaseProposal } from '@/lib/supabase-proposals';
import { useProposalTally } from '@/hooks/useProposalTally';
import { shortenAddress } from '@/lib/governance-utils';
import AnimatedGradientBorder from './AnimatedGradientBorder';
import CompactVotingBars from '@/components/proposals/CompactVotingBars';

const ILLUSTRATION = require('@/assets/illustration/buergerumfragen-cropped.png');

/** How long the ended/calculating/results card lingers after the deadline. */
const RESULTS_WINDOW_SEC = 24 * 3600;

/**
 * All open proposals (Pending or Active), newest first. Falls back to the
 * newest proposal when none are open so a just-ended card can linger through
 * its results window — each card still gates itself on the on-chain deadline.
 */
function useOpenProposals(): SupabaseProposal[] {
  const [proposals, setProposals] = useState<SupabaseProposal[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchProposals()
      .then((list) => {
        if (cancelled) return;
        if (!list || list.length === 0) {
          setProposals([]);
          return;
        }
        const open = list.filter((p) => p.state === 0 || p.state === 1);
        setProposals(open.length > 0 ? open : [list[0]]);
      })
      .catch(() => {
        if (!cancelled) setProposals([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return proposals;
}

function parseIdSafe(raw: string | number | null | undefined): bigint {
  if (raw === null || raw === undefined || raw === '') return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function formatCountdown(totalSec: number): string {
  if (totalSec <= 0) return '00:00:00';
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const core = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}d ${core}` : core;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleDateString('de-DE', { month: 'short' });
  return `${day}. ${month}`;
}

export default function FeedProposalHeroCard() {
  const proposals = useOpenProposals();

  // 1 Hz local tick shared by all cards so countdowns stay in sync.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (proposals.length === 0) return null;

  return (
    <>
      {proposals.map((p) => (
        <HeroProposalCard key={p.proposal_id} proposal={p} nowSec={nowSec} />
      ))}
    </>
  );
}

function HeroProposalCard({
  proposal,
  nowSec,
}: {
  proposal: SupabaseProposal;
  nowSec: number;
}) {
  const { colors } = useTheme();
  const router = useRouter();

  const proposalIdBig = useMemo(
    () => parseIdSafe(proposal.blockchain_proposal_id),
    [proposal.blockchain_proposal_id],
  );
  const tally = useProposalTally(proposalIdBig);

  const deadlineSec = tally.deadlineSec;
  const isActive = deadlineSec !== null && nowSec < deadlineSec;

  // ── Visibility gating ──────────────────────────────────────────────
  if (tally.orphan) return null;
  if (deadlineSec === null) return null; // chain state not loaded yet

  const ended = nowSec >= deadlineSec;
  const windowEnd = deadlineSec + RESULTS_WINDOW_SEC;
  if (ended && nowSec >= windowEnd) return null; // results expired → hide

  const calculating = ended && !tally.published;
  const results = ended && tally.published;

  const secondsToEnd = Math.max(0, deadlineSec - nowSec);

  const handlePress = () => {
    router.push(`/proposal/${proposal.proposal_id}` as any);
  };

  // Result outcome label/colors derived from on-chain tally.
  const accepted = tally.forVotes >= tally.againstVotes;

  return (
    <View style={styles.outer}>
      <AnimatedGradientBorder
        active={isActive}
        radius={16}
        borderWidth={2}
        colors={[colors.primary, colors.primaryLight, colors.primary]}
        backgroundColor={colors.background}
        idleBorderColor={colors.border}
      >
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.background },
            pressed && { backgroundColor: colors.pressedOverlay },
          ]}
        >
          <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" />

          <View style={styles.body}>
            <View style={styles.topRow}>
              <Text style={[styles.label, { color: colors.primary }]}>Bürgerumfrage</Text>

              {isActive ? (
                <View style={[styles.tag, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.countdownText, { color: colors.textPrimary }]}>
                    {formatCountdown(secondsToEnd)}
                  </Text>
                </View>
              ) : calculating ? (
                <View style={[styles.tag, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.calcText, { color: colors.textSecondary }]}>
                    Wird ausgewertet
                  </Text>
                </View>
              ) : results ? (
                <View
                  style={[
                    styles.tag,
                    { backgroundColor: accepted ? colors.successBackground : colors.errorBackground },
                  ]}
                >
                  <Text
                    style={[styles.resultText, { color: accepted ? colors.success : colors.error }]}
                  >
                    {accepted ? 'Angenommen' : 'Abgelehnt'}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {proposal.title}
            </Text>

            <Text style={[styles.creator, { color: colors.textSecondary }]} numberOfLines={1}>
              Von {shortenAddress(proposal.proposer_address)} • {formatDate(proposal.created_at)}
            </Text>

            {results ? (
              <View style={styles.resultsBlock}>
                <CompactVotingBars
                  forVotes={tally.forVotes}
                  againstVotes={tally.againstVotes}
                  abstainVotes={tally.abstainVotes}
                />
                <Text style={[styles.totalVotes, { color: colors.textSecondary }]}>
                  {tally.total.toString()} {tally.total === 1n ? 'Stimme' : 'Stimmen'}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handlePress}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
                {isActive ? 'Jetzt abstimmen' : 'Ergebnis ansehen'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </AnimatedGradientBorder>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    // Aligns with the feed's other cards: the FlatList contentContainer already
    // supplies the 8px horizontal gutter. Only add bottom spacing here.
    paddingBottom: 8,
  },
  card: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  illustration: {
    width: 64,
    height: 64,
    alignSelf: 'flex-start',
  },
  body: {
    flex: 1,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  countdownText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    fontVariant: ['tabular-nums'],
  },
  calcText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  resultText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    lineHeight: 22,
  },
  creator: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  resultsBlock: {
    gap: 6,
    marginTop: 2,
  },
  totalVotes: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  button: {
    height: 32,
    borderRadius: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    fontSize: 12,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
