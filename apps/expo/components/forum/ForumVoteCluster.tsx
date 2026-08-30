import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import ArrowUpIcon from '@/assets/icons/circle-arrow-up-02.svg';
import ArrowDownIcon from '@/assets/icons/circle-arrow-down-02.svg';
import { castForumVote, type ForumVoteTarget } from '@/lib/supabase-forum';

type Props = {
  targetType: ForumVoteTarget;
  targetId: string;
  upvotes: number;
  downvotes: number;
  /** The viewer's current vote, from useForumVotes hydration. */
  myVote: 1 | -1 | null;
  /** Notifies the parent so hydration caches stay in sync. */
  onVoted?: (next: 1 | -1 | null) => void;
  compact?: boolean;
};

/**
 * Reddit-style vote cluster: up-arrow · net score · down-arrow. Optimistic —
 * the tap applies locally first; castForumVote reconciles Supabase + the
 * NIP-25 mirror in the background.
 */
export default function ForumVoteCluster({
  targetType,
  targetId,
  upvotes,
  downvotes,
  myVote,
  onVoted,
  compact = false,
}: Props) {
  const { colors } = useTheme();
  const { user, isCitizen } = useUser();
  const [local, setLocal] = useState<{ vote: 1 | -1 | null; dUp: number; dDown: number } | null>(null);
  const generation = useRef(0);

  // Fresh server counts already include any reconciled vote — drop the local
  // overlay so the delta is never applied on top of itself. The myVote overlay
  // in useForumVotes keeps the arrow highlight through this reset.
  useEffect(() => {
    setLocal(null);
  }, [upvotes, downvotes]);

  const vote = local ? local.vote : myVote;
  const score = upvotes + (local?.dUp ?? 0) - (downvotes + (local?.dDown ?? 0));

  const tap = (tapped: 1 | -1) => {
    if (!user?.wallet_address || !isCitizen) return;
    const current = vote;
    const next = current === tapped ? null : tapped;
    const dUp = (next === 1 ? 1 : 0) - (current === 1 ? 1 : 0) + (local?.dUp ?? 0);
    const dDown = (next === -1 ? 1 : 0) - (current === -1 ? 1 : 0) + (local?.dDown ?? 0);
    const gen = ++generation.current;
    setLocal({ vote: next, dUp, dDown });
    onVoted?.(next);
    castForumVote(targetType, targetId, user.wallet_address, tapped, current).catch(() => {
      if (generation.current !== gen) return; // a newer tap owns the state now
      setLocal(null); // reconcile back to server truth on failure
      onVoted?.(myVote);
    });
  };

  const size = compact ? 18 : 22;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => tap(1)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Hochwählen"
        accessibilityState={{ selected: vote === 1 }}
      >
        <ArrowUpIcon width={size} height={size} color={vote === 1 ? colors.primary : colors.textSecondary} />
      </Pressable>
      <Text style={[styles.score, compact && styles.scoreCompact, { color: colors.textSecondary }]}>
        {score}
      </Text>
      <Pressable
        onPress={() => tap(-1)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Runterwählen"
        accessibilityState={{ selected: vote === -1 }}
      >
        <ArrowDownIcon width={size} height={size} color={vote === -1 ? colors.error : colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { fontSize: 13, fontFamily: fontFamily.medium, minWidth: 16, textAlign: 'center' },
  scoreCompact: { fontSize: 12 },
});
