import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { VoteType } from '@/lib/governance-types';
import type { VoteRecord } from '@/context/MaciContext';

interface LastVoteCardProps {
  vote: VoteRecord;
  /** Show the "Stimme ändern" CTA. False when voting is closed. */
  canChange: boolean;
  onChangeVote: () => void;
}

const OPTION_LABEL: Record<number, string> = {
  [VoteType.For]: 'Dafür',
  [VoteType.Against]: 'Dagegen',
  [VoteType.Abstain]: 'Enthalten',
};

function relativeTime(secondsAgo: number): string {
  if (secondsAgo < 60) return 'gerade eben';
  if (secondsAgo < 3600) return `vor ${Math.floor(secondsAgo / 60)} Min`;
  if (secondsAgo < 86400) return `vor ${Math.floor(secondsAgo / 3600)} Std`;
  return `vor ${Math.floor(secondsAgo / 86400)} Tg`;
}

function shortHash(hash: string): string {
  if (hash.length < 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/**
 * Shown after a successful publishMessage. Confirms the citizen's last
 * recorded vote (read from secure-store, not chain — the vote is encrypted)
 * and links to the on-chain tx for verification.
 */
export default function LastVoteCard({ vote, canChange, onChangeVote }: LastVoteCardProps) {
  const { colors } = useTheme();
  const label = OPTION_LABEL[vote.optionIndex] ?? 'unbekannt';
  const ago = relativeTime(Math.max(0, Math.floor(Date.now() / 1000) - vote.votedAt));
  const txUrl = `https://gnosisscan.io/tx/${vote.txHash}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={styles.row}>
        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          Du hast „{label}" gestimmt
        </Text>
        {canChange ? (
          <Pressable onPress={onChangeVote} hitSlop={8}>
            <Text style={[styles.changeLink, { color: colors.primary }]}>Stimme ändern</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Geheim gesendet · {ago} ·{' '}
        </Text>
        <Pressable onPress={() => Linking.openURL(txUrl)} hitSlop={6}>
          <Text style={[styles.txLink, { color: colors.textSecondary }]}>
            {shortHash(vote.txHash)} ↗
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headline: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    flexShrink: 1,
    paddingRight: 12,
  },
  changeLink: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  txLink: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textDecorationLine: 'underline',
  },
});
