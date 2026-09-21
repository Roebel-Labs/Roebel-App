import { buildInterestPreviews, INTEREST_PREVIEW_USER_LIMIT } from '../interest-previews';

const rows = [
  { event_id: 'a', user_wallet: '0xAAA' },
  { event_id: 'a', user_wallet: '0xBBB' },
  { event_id: 'b', user_wallet: '0xaaa' },
];
const users = [
  { wallet_address: '0xaaa', username: 'anna', profile_picture_url: 'https://x/a.png' },
];

describe('buildInterestPreviews', () => {
  it('counts per event and resolves profiles case-insensitively', () => {
    const previews = buildInterestPreviews(['a', 'b'], rows, users);
    expect(previews.get('a')?.count).toBe(2);
    expect(previews.get('a')?.users).toEqual([
      { wallet_address: '0xAAA', username: 'anna', profile_picture_url: 'https://x/a.png' },
      { wallet_address: '0xBBB', username: null, profile_picture_url: null },
    ]);
    expect(previews.get('b')?.count).toBe(1);
    expect(previews.get('b')?.users[0].username).toBe('anna');
  });

  it('returns an empty preview for every requested event with no interest', () => {
    const previews = buildInterestPreviews(['a', 'zzz'], rows, users);
    expect(previews.get('zzz')).toEqual({ count: 0, users: [] });
  });

  it('caps the user list at the preview limit but keeps the full count', () => {
    const many = Array.from({ length: INTEREST_PREVIEW_USER_LIMIT + 5 }, (_, i) => ({
      event_id: 'big',
      user_wallet: `0x${i}`,
    }));
    const previews = buildInterestPreviews(['big'], many, []);
    expect(previews.get('big')?.count).toBe(INTEREST_PREVIEW_USER_LIMIT + 5);
    expect(previews.get('big')?.users).toHaveLength(INTEREST_PREVIEW_USER_LIMIT);
  });
});
