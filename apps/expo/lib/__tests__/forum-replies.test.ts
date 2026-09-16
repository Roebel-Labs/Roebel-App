import { groupReplies, isCollapsed, resolveMentionName, replyDisplayName } from '../forum-replies';
import type { ForumReplyRecord } from '../types/feed';

const reply = (
  id: string,
  wallet: string,
  extra: Partial<ForumReplyRecord> = {},
): ForumReplyRecord =>
  ({
    id,
    thread_id: 't1',
    parent_reply_id: null,
    reply_to_reply_id: null,
    wallet_address: wallet,
    account_id: null,
    body: `body ${id}`,
    status: 'published',
    upvotes_count: 0,
    downvotes_count: 0,
    created_at: '2026-09-16T10:00:00Z',
    edited_at: null,
    author_kind: 'citizen',
    author: { wallet_address: wallet, username: `user-${wallet}` } as ForumReplyRecord['author'],
    ...extra,
  }) as ForumReplyRecord;

describe('groupReplies', () => {
  it('nests children under their top-level parent and keeps orphans top-level', () => {
    const a = reply('a', '0x1');
    const b = reply('b', '0x2', { parent_reply_id: 'a' });
    const orphan = reply('c', '0x3', { parent_reply_id: 'missing' });
    const grouped = groupReplies([a, b, orphan]);
    expect(grouped.map((g) => g.id)).toEqual(['a', 'c']);
    expect(grouped[0].children.map((c) => c.id)).toEqual(['b']);
  });
});

describe('resolveMentionName', () => {
  const a = reply('a', '0x1');
  const b = reply('b', '0x2', { parent_reply_id: 'a', reply_to_reply_id: 'a' });
  const c = reply('c', '0x3', { parent_reply_id: 'a', reply_to_reply_id: 'b' });
  const self = reply('d', '0x2', { parent_reply_id: 'a', reply_to_reply_id: 'b' });
  const legacy = reply('e', '0x4', { parent_reply_id: 'a' });
  const byId = new Map([a, b, c, self, legacy].map((r) => [r.id, r]));

  it('names the directly answered author', () => {
    expect(resolveMentionName(c, byId)?.name).toBe('user-0x2');
  });
  it('names the top-level author when answering it directly', () => {
    expect(resolveMentionName(b, byId)?.name).toBe('user-0x1');
  });
  it('falls back to parent_reply_id for legacy rows', () => {
    expect(resolveMentionName(legacy, byId)?.name).toBe('user-0x1');
  });
  it('is null when answering yourself or a missing target', () => {
    expect(resolveMentionName(self, byId)).toBeNull();
    expect(resolveMentionName(reply('f', '0x9', { reply_to_reply_id: 'nope' }), byId)).toBeNull();
    expect(resolveMentionName(a, byId)).toBeNull();
  });
});

describe('replyDisplayName', () => {
  it('prefers the organisation name for org accounts', () => {
    const r = reply('a', '0x1', {
      author: {
        wallet_address: '0x1',
        username: 'person',
        account: { id: 'acc', account_type: 'organisation', name: 'TSV Röbel', avatar_url: null },
      } as ForumReplyRecord['author'],
    });
    expect(replyDisplayName(r)).toBe('TSV Röbel');
    expect(replyDisplayName(undefined)).toBe('Unbekannt');
  });
});

describe('isCollapsed', () => {
  it('collapses only above two children and only while not expanded', () => {
    expect(isCollapsed(2, false)).toBe(false);
    expect(isCollapsed(3, false)).toBe(true);
    expect(isCollapsed(3, true)).toBe(false);
  });
});
