import { assembleFeed } from '../feed-assembler';
import type { BuergerratSummary, PostRecord } from '../types/feed';

const post = (id: string, createdAt: string): PostRecord =>
  ({ id, created_at: createdAt, post_type: 'user', pinned_until: null }) as unknown as PostRecord;

const summary: BuergerratSummary = {
  count: 11,
  newestCreatedAt: '2026-09-16T10:00:10Z',
  beschlossen: 0,
  umgesetzt: 0,
};

const base = {
  alerts: [],
  deals: [],
  marketplaceListings: [],
  upcomingEvents: [],
};

describe('assembleFeed Bürgerrat card', () => {
  it('sits right after the first post on the main feed', () => {
    const items = assembleFeed({
      ...base,
      posts: [post('p1', '2026-09-16T10:00:00Z'), post('p2', '2026-09-16T09:00:00Z')],
      buergerrat: summary,
      feedType: 'main',
    });
    expect(items.map((i) => i.id)).toEqual(['post-p1', 'buergerrat-card', 'post-p2']);
    expect(items[1].type).toBe('buergerrat_card');
  });

  it('is absent without recommendations and on the rathaus feed', () => {
    const none = assembleFeed({ ...base, posts: [post('p1', '2026-09-16T10:00:00Z')], buergerrat: { ...summary, count: 0 }, feedType: 'main' });
    expect(none.find((i) => i.type === 'buergerrat_card')).toBeUndefined();
    const rathaus = assembleFeed({ ...base, posts: [post('p1', '2026-09-16T10:00:00Z')], buergerrat: summary, feedType: 'rathaus' });
    expect(rathaus.find((i) => i.type === 'buergerrat_card')).toBeUndefined();
  });
});
