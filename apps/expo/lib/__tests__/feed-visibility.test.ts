import { filterVisiblePosts, isQuoteHidden } from '../feed-visibility';
import { EMPTY_SNAPSHOT, buildHiddenIndex } from '../relations-state';

const index = buildHiddenIndex({ ...EMPTY_SNAPSHOT, muted: ['m'], mutedWallets: ['0xmm'], unfollowed: ['u'] });

describe('feed-visibility', () => {
  it('drops posts by hidden accounts, including legacy rows', () => {
    const posts = [
      { id: '1', account_id: 'm', wallet_address: '0xmm' },
      { id: '2', account_id: null, wallet_address: '0xMM' },
      { id: '3', account_id: 'u', wallet_address: '0xuu' },
      { id: '4', account_id: 'ok', wallet_address: '0xok' },
    ];
    expect(filterVisiblePosts(posts, index).map((p) => p.id)).toEqual(['4']);
  });
  it('hides a quote only when its author is MUTED', () => {
    expect(isQuoteHidden({ id: 'r', quoted_post: { id: 'q', account_id: 'm', wallet_address: '0xmm' } }, index)).toBe(true);
    expect(isQuoteHidden({ id: 'r', quoted_post: { id: 'q', account_id: 'u', wallet_address: '0xuu' } }, index)).toBe(false);
    expect(isQuoteHidden({ id: 'r', quoted_post: null }, index)).toBe(false);
  });
  it('drops a pure repost of a muted author, keeps a quote of one', () => {
    const q = { id: 'q', account_id: 'm', wallet_address: '0xmm' };
    const posts = [
      { id: 'r', post_type: 'repost', account_id: 'ok', wallet_address: '0xok', quoted_post: q },
      { id: 'qt', post_type: 'quote', account_id: 'ok', wallet_address: '0xok', quoted_post: q },
    ];
    expect(filterVisiblePosts(posts, index).map((p) => p.id)).toEqual(['qt']);
  });
});
