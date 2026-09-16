import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ForumReplyItem from './ForumReplyItem';
import {
  INLINE_CHILDREN_LIMIT,
  isCollapsed,
  resolveMentionName,
  type GroupedReply,
} from '@/lib/forum-replies';
import type { ForumReplyRecord } from '@/lib/types/feed';

type Props = {
  group: GroupedReply;
  /** Every loaded reply by id, for @-mention resolution. */
  byId: Map<string, ForumReplyRecord>;
  threadAuthorWallet: string;
  expanded: boolean;
  onToggleExpanded: (topLevelId: string) => void;
  myVote: (replyId: string) => 1 | -1 | null;
  onVoted: (replyId: string, next: 1 | -1 | null) => void;
  onReply: (reply: ForumReplyRecord) => void;
  onOptions: (reply: ForumReplyRecord) => void;
};

/**
 * A top-level reply with its children under a connector rail. More than
 * INLINE_CHILDREN_LIMIT children collapse behind "N Antworten anzeigen".
 */
export default function ForumReplyThread({
  group,
  byId,
  threadAuthorWallet,
  expanded,
  onToggleExpanded,
  myVote,
  onVoted,
  onReply,
  onOptions,
}: Props) {
  const { colors } = useTheme();
  const isAuthor = (r: ForumReplyRecord) =>
    r.wallet_address.toLowerCase() === threadAuthorWallet.toLowerCase();
  const children = group.children;
  const collapsed = isCollapsed(children.length, expanded);

  const toggle = (label: string) => (
    <Pressable
      onPress={() => onToggleExpanded(group.id)}
      style={styles.expander}
      hitSlop={8}
      accessibilityRole="button"
    >
      <View style={[styles.elbow, { backgroundColor: colors.borderTertiary }]} />
      <Text style={[styles.expanderText, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.borderTertiary }]}>
      <ForumReplyItem
        reply={group}
        isThreadAuthor={isAuthor(group)}
        mention={null}
        myVote={myVote(group.id)}
        onVoted={(next) => onVoted(group.id, next)}
        onReply={onReply}
        onOptions={onOptions}
      />
      {children.length > 0 && (
        <View style={[styles.rail, { borderLeftColor: colors.borderTertiary }]}>
          {collapsed ? (
            toggle(`${children.length} Antworten anzeigen`)
          ) : (
            <>
              {children.map((child) => (
                <ForumReplyItem
                  key={child.id}
                  reply={child}
                  isChild
                  isThreadAuthor={isAuthor(child)}
                  mention={resolveMentionName(child, byId)}
                  myVote={myVote(child.id)}
                  onVoted={(next) => onVoted(child.id, next)}
                  onReply={onReply}
                  onOptions={onOptions}
                />
              ))}
              {children.length > INLINE_CHILDREN_LIMIT && toggle('Antworten ausblenden')}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // x = 16px row padding + 16px (half of the 32px avatar): the rail hangs
  // from the centre of the parent avatar, like a Facebook reply thread.
  rail: {
    marginLeft: 32,
    borderLeftWidth: 1.5,
    paddingLeft: 4,
  },
  expander: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  elbow: { width: 16, height: 1.5 },
  expanderText: { fontSize: 12, fontFamily: fontFamily.semiBold },
});
