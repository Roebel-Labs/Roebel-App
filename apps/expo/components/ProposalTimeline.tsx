/**
 * Real-time countdown + timeline card, mirroring the web's ProposalTimeline +
 * ProposalCountdown but in StyleSheet/useTheme styling.
 *
 * Countdown anchors on Unix timestamps derived from governor.proposalSnapshot
 * + governor.proposalDeadline. After the initial chain read we tick locally
 * (1 Hz) instead of re-polling clock() so the timer feels responsive; we
 * re-anchor every 30 s to absorb clock drift between the device and Base's
 * sequencer.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { readContract } from 'thirdweb';
import { governorContract, getTallyContract } from '@/constants/thirdweb';
import { ProposalState } from '@/lib/governance-types';
import { useTheme } from '@/context/ThemeContext';
import { toBigInt } from '@/lib/governance-utils';

interface ProposalTimelineProps {
  proposalId: bigint;
  proposalState: ProposalState;
  /** ISO timestamp from Supabase. Used as the "Erstellt" anchor. */
  createdAt?: string;
}

type ClockMode = 'timestamp' | 'blocknumber';

const BLOCK_TIME_SECONDS = 2; // Base mainnet
const CHAIN_RESYNC_MS = 30_000; // re-read clock() every 30s
const TICK_MS = 1_000; // local UI tick

interface Anchors {
  /** Unix-seconds epoch the device computed when it last anchored. */
  anchoredAt: number;
  /** Voting-start moment, Unix seconds. */
  startUnix: number;
  /** Voting-end moment, Unix seconds. */
  endUnix: number;
  /** Voting delay in seconds (0 in timestamp-mode + zero-delay governors). */
  votingDelaySeconds: number;
  /** Voting period in seconds. */
  votingPeriodSeconds: number;
  clockMode: ClockMode;
  /** Real on-chain tally state. `tallyAddress` is null while the proposal isn't
   *  on the current Governor (orphan); `published === true` once the
   *  coordinator has called addTallyResults at least once. */
  tallyAddress: string | null;
  tallyPublished: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(date: Date): string {
  return date.toLocaleString('de-DE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ProposalTimeline({
  proposalId,
  proposalState,
  createdAt,
}: ProposalTimelineProps) {
  const { colors } = useTheme();
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  const cancelledRef = useRef(false);

  // 1Hz local tick — drives the seconds counter.
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Pull all anchors from chain once; re-pull every 30s to correct drift.
  useEffect(() => {
    if (!proposalId || proposalId === 0n) return;
    cancelledRef.current = false;

    const anchor = async () => {
      try {
        const [modeRaw, clockRaw, snapshotRaw, deadlineRaw, delayRaw, periodRaw, pollsRaw] = await Promise.all([
          readContract({
            contract: governorContract,
            method: 'function CLOCK_MODE() view returns (string)',
            params: [],
          }) as Promise<string>,
          readContract({
            contract: governorContract,
            method: 'function clock() view returns (uint48)',
            params: [],
          }),
          readContract({
            contract: governorContract,
            method: 'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
            params: [proposalId],
          }),
          readContract({
            contract: governorContract,
            method: 'function proposalDeadline(uint256 proposalId) view returns (uint256)',
            params: [proposalId],
          }),
          readContract({
            contract: governorContract,
            method: 'function votingDelay() view returns (uint256)',
            params: [],
          }),
          readContract({
            contract: governorContract,
            method: 'function votingPeriod() view returns (uint256)',
            params: [],
          }),
          readContract({
            contract: governorContract,
            method:
              'function proposalPolls(uint256) view returns (uint256 pollId, address poll, address messageProcessor, address tally, uint256 deadline)',
            params: [proposalId],
          }) as Promise<readonly [bigint, string, string, string, bigint]>,
        ]);
        if (cancelledRef.current) return;

        const clockMode: ClockMode = (modeRaw || '').includes('mode=blocknumber')
          ? 'blocknumber'
          : 'timestamp';
        const clockUnits = toBigInt(clockRaw);
        const snapshotUnits = toBigInt(snapshotRaw);
        const deadlineUnits = toBigInt(deadlineRaw);
        const votingDelay = toBigInt(delayRaw);
        const votingPeriod = toBigInt(periodRaw);
        const tallyAddrRaw = pollsRaw[3];
        const tallyAddress =
          tallyAddrRaw && tallyAddrRaw.toLowerCase() !== '0x0000000000000000000000000000000000000000'
            ? tallyAddrRaw
            : null;

        // Read totalTallyResults if we have a tally addr — gates the
        // "Ergebnis veröffentlicht" stage. Cheap (one chain read) and
        // rolls into the same 30 s anchor refresh.
        let tallyPublished = false;
        if (tallyAddress) {
          try {
            const total = (await readContract({
              contract: getTallyContract(tallyAddress),
              method: 'function totalTallyResults() view returns (uint256)',
              params: [],
            })) as bigint;
            tallyPublished = toBigInt(total) > 0n;
          } catch (err) {
            console.warn('[ProposalTimeline] totalTallyResults read failed:', err);
          }
          if (cancelledRef.current) return;
        }

        const unitsToSeconds = (n: bigint): number =>
          clockMode === 'timestamp' ? Number(n) : Number(n) * BLOCK_TIME_SECONDS;

        const wallNow = Math.floor(Date.now() / 1000);
        let startUnix: number;
        let endUnix: number;
        if (clockMode === 'timestamp') {
          startUnix = Number(snapshotUnits);
          endUnix = Number(deadlineUnits);
        } else {
          // block-number mode: anchor relative to current device clock + (target - clockNow) * 2s.
          startUnix = wallNow + unitsToSeconds(snapshotUnits - clockUnits);
          endUnix = wallNow + unitsToSeconds(deadlineUnits - clockUnits);
        }

        setAnchors({
          anchoredAt: wallNow,
          startUnix,
          endUnix,
          votingDelaySeconds: unitsToSeconds(votingDelay),
          votingPeriodSeconds: unitsToSeconds(votingPeriod),
          clockMode,
          tallyAddress,
          tallyPublished,
        });
      } catch (err) {
        console.warn('[ProposalTimeline] anchor read failed:', err);
      }
    };

    anchor();
    const id = setInterval(anchor, CHAIN_RESYNC_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [proposalId]);

  const createdDate = useMemo(
    () => (createdAt ? new Date(createdAt) : null),
    [createdAt],
  );
  const startDate = useMemo(
    () => (anchors ? new Date(anchors.startUnix * 1000) : null),
    [anchors],
  );
  const endDate = useMemo(
    () => (anchors ? new Date(anchors.endUnix * 1000) : null),
    [anchors],
  );

  if (!anchors) return null;

  const isPending = nowSec < anchors.startUnix;
  const isActive = nowSec >= anchors.startUnix && nowSec <= anchors.endUnix;
  const isEnded = nowSec > anchors.endUnix;

  const secondsToStart = Math.max(0, anchors.startUnix - nowSec);
  const secondsToEnd = Math.max(0, anchors.endUnix - nowSec);

  let countdownLabel = '';
  let countdownSeconds = 0;
  let countdownTotal = 0;
  let countdownEmoji = '';
  let countdownAccent: string = colors.textSecondary;
  let endedMessage = '';
  if (isPending) {
    countdownLabel = 'Abstimmung startet in';
    countdownSeconds = secondsToStart;
    countdownTotal = anchors.votingDelaySeconds || 86400;
    countdownEmoji = '⏳';
    countdownAccent = '#F59E0B'; // amber
  } else if (isActive) {
    countdownLabel = 'Abstimmung endet in';
    countdownSeconds = secondsToEnd;
    countdownTotal = anchors.votingPeriodSeconds || 1800;
    countdownEmoji = '🗳️';
    countdownAccent = '#10B981'; // green
  } else {
    endedMessage = 'Abstimmung beendet';
  }

  const progressPct = countdownTotal > 0
    ? Math.max(0, Math.min(100, ((countdownTotal - countdownSeconds) / countdownTotal) * 100))
    : 100;

  return (
    <View style={styles.wrapper}>
      {/* Countdown card */}
      {isPending || isActive ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
          ]}
        >
          <View style={styles.countdownRow}>
            <View style={styles.countdownTextWrap}>
              <Text style={[styles.countdownLabel, { color: colors.textSecondary }]}>
                {countdownLabel}
              </Text>
              <Text style={[styles.countdownTime, { color: colors.textPrimary }]}>
                {formatDuration(countdownSeconds)}
              </Text>
            </View>
            <Text style={styles.countdownEmoji}>{countdownEmoji}</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct}%`, backgroundColor: countdownAccent },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* Timeline ("Verlauf") — flat: no card background, border, padding, or icon. */}
      <View>
        <View style={styles.timelineHeader}>
          <Text style={[styles.timelineHeaderText, { color: colors.textSecondary }]}>VERLAUF</Text>
        </View>

        <Stage
          dotColor={colors.textPrimary}
          showConnector
          colors={colors}
          title="Erstellt"
          titleColor={colors.textPrimary}
          subtitle={createdDate ? formatDate(createdDate) : '—'}
        />

        <Stage
          dotColor={isActive || isEnded ? colors.textPrimary : '#F59E0B'}
          showConnector
          colors={colors}
          title={`Abstimmung beginnt ${isPending ? '⏳' : ''}`.trim()}
          titleColor={isActive || isEnded ? colors.textPrimary : '#F59E0B'}
          subtitle={startDate ? formatDate(startDate) : '—'}
          tertiary={
            anchors.votingDelaySeconds > 0
              ? `Vorlaufzeit: ${formatDuration(anchors.votingDelaySeconds)}`
              : undefined
          }
        />

        <Stage
          dotColor={isEnded ? colors.textPrimary : colors.disabled}
          showConnector
          colors={colors}
          title={`Abstimmung endet ${isActive ? '🗳️' : ''}`.trim()}
          titleColor={isEnded ? colors.textPrimary : colors.textSecondary}
          subtitle={endDate ? formatDate(endDate) : '—'}
          tertiary={`Dauer: ${formatDuration(anchors.votingPeriodSeconds)}`}
        />

        <Stage
          dotColor={anchors.tallyPublished ? colors.textPrimary : colors.disabled}
          colors={colors}
          title={anchors.tallyPublished ? 'Ergebnis veröffentlicht' : 'Ergebnis ausstehend'}
          titleColor={anchors.tallyPublished ? colors.textPrimary : colors.textSecondary}
          subtitle={
            anchors.tallyPublished
              ? 'im dezentralen Netzwerk'
              : isEnded
                ? 'wird berechnet…'
                : '—'
          }
        />

        {isEnded && !anchors.tallyPublished ? (
          <Text style={[styles.endedNote, { color: colors.textSecondary }]}>{endedMessage}</Text>
        ) : null}
      </View>

      {/* Ignored — unused styles guard against TS unused warnings */}
      {/* eslint-disable-next-line react/jsx-no-undef */}
    </View>
  );
}

interface StageProps {
  dotColor: string;
  showConnector?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  title: string;
  titleColor: string;
  subtitle: string;
  tertiary?: string;
}

function Stage({
  dotColor,
  showConnector = false,
  colors,
  title,
  titleColor,
  subtitle,
  tertiary,
}: StageProps) {
  return (
    <View style={styles.stageRow}>
      <View style={styles.stageDotCol}>
        <View style={[styles.stageDot, { backgroundColor: dotColor }]} />
        {showConnector ? <View style={[styles.stageConnector, { backgroundColor: colors.border }]} /> : null}
      </View>
      <View style={styles.stageContent}>
        <Text style={[styles.stageTitle, { color: titleColor }]}>{title}</Text>
        <Text style={[styles.stageSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        {tertiary ? (
          <Text style={[styles.stageTertiary, { color: colors.textSecondary }]}>{tertiary}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    marginVertical: 16,
    gap: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  countdownTextWrap: {
    flex: 1,
  },
  countdownLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
  },
  countdownTime: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
  },
  countdownEmoji: {
    fontSize: 28,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  timelineHeaderEmoji: {
    fontSize: 14,
  },
  timelineHeaderText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    letterSpacing: 1,
  },
  stageRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stageDotCol: {
    alignItems: 'center',
    width: 12,
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  stageConnector: {
    width: 1,
    flex: 1,
    marginTop: 4,
  },
  stageContent: {
    flex: 1,
    paddingBottom: 16,
  },
  stageTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  stageSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  stageTertiary: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  endedNote: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    marginTop: 4,
  },
});
