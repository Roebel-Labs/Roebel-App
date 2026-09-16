import type { ForumReplyRecord, PostAuthor } from './types/feed';

export type GroupedReply = ForumReplyRecord & { children: ForumReplyRecord[] };

/** Children up to this many render inline; more collapse behind "N Antworten anzeigen". */
export const INLINE_CHILDREN_LIMIT = 2;

export type ReplyMention = { name: string; author: PostAuthor | undefined };

/**
 * Replies are single-level nested (forum spec §A2.4): parent_reply_id always
 * points at a top-level reply. Group into top-level + direct children; a
 * child whose parent is missing (deleted) is shown top-level rather than lost.
 */
export function groupReplies(replies: ForumReplyRecord[]): GroupedReply[] {
  const byId = new Map<string, GroupedReply>();
  replies.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const topLevel: GroupedReply[] = [];
  replies.forEach((r) => {
    const node = byId.get(r.id)!;
    if (r.parent_reply_id && byId.has(r.parent_reply_id)) {
      byId.get(r.parent_reply_id)!.children.push(r);
    } else {
      topLevel.push(node);
    }
  });
  return topLevel;
}

export function replyDisplayName(reply: Pick<ForumReplyRecord, 'author'> | undefined): string {
  const author = reply?.author;
  if (!author) return 'Unbekannt';
  if (author.account?.account_type === 'organisation' && author.account.name) return author.account.name;
  return author.username || 'Unbekannt';
}

/**
 * The "@Name" prefix of a nested reply: the author of the directly answered
 * reply (reply_to_reply_id), falling back to the top-level parent for rows
 * written before that column existed. Null when the target is missing or is
 * the reply's own author.
 */
export function resolveMentionName(
  reply: ForumReplyRecord,
  byId: Map<string, ForumReplyRecord>,
): ReplyMention | null {
  const targetId = reply.reply_to_reply_id ?? reply.parent_reply_id;
  if (!targetId) return null;
  const target = byId.get(targetId);
  if (!target) return null;
  if (target.wallet_address.toLowerCase() === reply.wallet_address.toLowerCase()) return null;
  return { name: replyDisplayName(target), author: target.author };
}

export function isCollapsed(childCount: number, expanded: boolean): boolean {
  return childCount > INLINE_CHILDREN_LIMIT && !expanded;
}
