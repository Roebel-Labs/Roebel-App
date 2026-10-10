import { EMPTY_SNAPSHOT, applyRelationChange, buildHiddenIndex, hiddenAccountIds, isAuthorHiddenInFeed, isAuthorMuted } from '../relations-state';

const snap = {
  ...EMPTY_SNAPSHOT,
  unfollowed: ['acc-u'],
  muted: ['acc-m'],
  unfollowedWallets: ['0xaaa'],
  mutedWallets: ['0xbbb'],
};

describe('relations-state', () => {
  it('hides unfollowed and muted accounts from the feed', () => {
    const i = buildHiddenIndex(snap);
    expect(isAuthorHiddenInFeed(i, { account_id: 'acc-u' })).toBe(true);
    expect(isAuthorHiddenInFeed(i, { account_id: 'acc-m' })).toBe(true);
    expect(isAuthorHiddenInFeed(i, { account_id: 'acc-x' })).toBe(false);
  });

  it('hides legacy posts without account_id by owner wallet, case-insensitively', () => {
    const i = buildHiddenIndex(snap);
    expect(isAuthorHiddenInFeed(i, { account_id: null, wallet_address: '0xAAA' })).toBe(true);
    expect(isAuthorHiddenInFeed(i, { account_id: null, wallet_address: '0xccc' })).toBe(false);
  });

  it('a person posting AS an org is not hidden by muting the person', () => {
    const i = buildHiddenIndex(snap);
    expect(isAuthorHiddenInFeed(i, { account_id: 'org-1', wallet_address: '0xbbb' })).toBe(false);
  });

  it('only mutes count for comments and notifications', () => {
    const i = buildHiddenIndex(snap);
    expect(isAuthorMuted(i, { account_id: 'acc-u' })).toBe(false);
    expect(isAuthorMuted(i, { account_id: 'acc-m' })).toBe(true);
    expect(isAuthorMuted(i, { wallet_address: '0xBBB' })).toBe(true);
  });

  it('follow clears unfollowed; unfollow clears following', () => {
    let s = applyRelationChange(snap, { kind: 'follow', ids: ['acc-u'] });
    expect(s.following).toContain('acc-u');
    expect(s.unfollowed).not.toContain('acc-u');
    s = applyRelationChange(s, { kind: 'unfollow', ids: ['acc-u'] });
    expect(s.following).not.toContain('acc-u');
    expect(s.unfollowed).toContain('acc-u');
  });

  it('mute keeps the follow (invisible to the target) and unmute restores', () => {
    let s = applyRelationChange({ ...EMPTY_SNAPSHOT, following: ['p'] }, { kind: 'mute', id: 'p', wallet: '0xDDD' });
    expect(s.following).toContain('p');
    expect(s.muted).toContain('p');
    expect(s.mutedWallets).toContain('0xddd');
    s = applyRelationChange(s, { kind: 'unmute', id: 'p', wallet: '0xddd' });
    expect(s.muted).not.toContain('p');
    expect(s.mutedWallets).not.toContain('0xddd');
  });

  it('hiddenAccountIds is sorted and deduped so it is a stable query key', () => {
    expect(hiddenAccountIds({ ...EMPTY_SNAPSHOT, unfollowed: ['b', 'a'], muted: ['a'] })).toEqual(['a', 'b']);
  });
});
