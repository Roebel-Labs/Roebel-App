import { filterMutedNotifications, filterMutedComments } from '../inbox-visibility';
import { EMPTY_SNAPSHOT, buildHiddenIndex } from '../relations-state';

const index = buildHiddenIndex({ ...EMPTY_SNAPSHOT, muted: ['m'], mutedWallets: ['0xmm'] });

describe('inbox-visibility', () => {
  it('drops notices whose actor is muted, keeps the rest', () => {
    const items = [
      { id: 1, metadata: { actor_wallet: '0xMM' } },
      { id: 2, metadata: { actor_wallet: '0xok' } },
      { id: 3, metadata: null },
    ];
    expect(filterMutedNotifications(items, index).map((i) => i.id)).toEqual([2, 3]);
  });
  it('drops comments and replies by muted authors', () => {
    const comments = [
      { id: 'a', account_id: 'm', wallet_address: '0xmm', replies: [] },
      { id: 'b', account_id: null, wallet_address: '0xok', replies: [{ id: 'c', account_id: null, wallet_address: '0xmm' }] },
    ];
    const out = filterMutedComments(comments, index);
    expect(out.map((c) => c.id)).toEqual(['b']);
    expect(out[0].replies).toEqual([]);
  });
});
