import { assembleFeed } from '../feed-assembler';
import type { ForumThreadRecord, PostRecord } from '../types/feed';

const post = (id: string, createdAt: string): PostRecord =>
  ({
    id,
    created_at: createdAt,
    post_type: 'user',
    pinned_until: null,
  }) as unknown as PostRecord;

const thread = (id: string, createdAt: string): ForumThreadRecord =>
  ({
    id,
    title: `Thema ${id}`,
    created_at: createdAt,
    status: 'published',
  }) as unknown as ForumThreadRecord;

describe('assembleFeed rathaus forum threads', () => {
  it('interleaves forum threads with posts by created_at desc', () => {
    const items = assembleFeed({
      posts: [post('p1', '2026-08-29T10:00:00Z'), post('p2', '2026-08-29T08:00:00Z')],
      alerts: [],
      deals: [],
      marketplaceListings: [],
      upcomingEvents: [],
      forumThreads: [thread('t1', '2026-08-29T09:00:00Z')],
      feedType: 'rathaus',
    });
    expect(items.map((i) => i.id)).toEqual(['post-p1', 'forum-thread-t1', 'post-p2']);
    expect(items[1].type).toBe('forum_thread');
  });

  it('ignores forum threads outside the rathaus feed', () => {
    const items = assembleFeed({
      posts: [],
      alerts: [],
      deals: [],
      marketplaceListings: [],
      upcomingEvents: [],
      forumThreads: [thread('t1', '2026-08-29T09:00:00Z')],
      feedType: 'main',
    });
    expect(items.find((i) => i.type === 'forum_thread')).toBeUndefined();
  });
});
