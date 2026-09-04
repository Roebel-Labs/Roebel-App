/**
 * The registry's pure parts: the acceptance-key format the map joins on, and
 * the signed request body the edge function re-derives and verifies.
 *
 * The message format must stay byte-identical to the server's, so the hashing
 * rules (ordinal key sort, JSON.stringify, SHA-256 hex) are pinned here the
 * same way lib/org-membership.ts pins its own.
 */
import { acceptanceKey, buildMerchantRequestBody } from '../merchant/registry';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  // Deterministic stand-in: the real digest is exercised by org-membership.
  digestStringAsync: jest.fn(async (_alg: string, value: string) => `hash(${value})`),
}));

describe('acceptanceKey', () => {
  it('joins type and id with a colon', () => {
    expect(acceptanceKey('business', 'b-1')).toBe('business:b-1');
    expect(acceptanceKey('restaurant', 'r-1')).toBe('restaurant:r-1');
    expect(acceptanceKey('account', 'a-1')).toBe('account:a-1');
  });

  it('lower-cases the id so lookups are case-insensitive', () => {
    expect(acceptanceKey('business', 'B-1')).toBe('business:b-1');
  });

  it('does not collide across types that share an id', () => {
    expect(acceptanceKey('business', 'x')).not.toBe(acceptanceKey('restaurant', 'x'));
  });
});

describe('buildMerchantRequestBody', () => {
  const account = {
    address: '0xAbC0000000000000000000000000000000000001',
    signMessage: jest.fn().mockResolvedValue('0xsig'),
  };

  beforeEach(() => account.signMessage.mockClear());

  it('lower-cases the wallet and carries action, timestamp and signature', async () => {
    const body = await buildMerchantRequestBody(
      account,
      'upsert_account',
      { gpUserId: 'u1' },
      1_757_000_000,
    );

    expect(body.wallet).toBe('0xabc0000000000000000000000000000000000001');
    expect(body.action).toBe('upsert_account');
    expect(body.timestampSec).toBe(1_757_000_000);
    expect(body.signature).toBe('0xsig');
    expect(body.payload).toEqual({ gpUserId: 'u1' });
  });

  it('signs a versioned message naming the action and lower-cased wallet', async () => {
    await buildMerchantRequestBody(account, 'link_entity', { entityId: 'b-1' }, 1_757_000_000);

    const [{ message }] = account.signMessage.mock.calls[0];
    expect(message).toContain('roebel-merchant-v1:link_entity:');
    expect(message).toContain('0xabc0000000000000000000000000000000000001');
    expect(message).toContain('1757000000');
  });

  it('sorts payload keys so key order cannot change the signature', async () => {
    await buildMerchantRequestBody(account, 'upsert_account', { a: 1, b: 2 }, 1_757_000_000);
    const first = account.signMessage.mock.calls[0][0].message;
    account.signMessage.mockClear();

    await buildMerchantRequestBody(account, 'upsert_account', { b: 2, a: 1 }, 1_757_000_000);
    const second = account.signMessage.mock.calls[0][0].message;

    expect(second).toBe(first);
  });

  it('changes the signed message when the payload changes', async () => {
    await buildMerchantRequestBody(account, 'upsert_account', { a: 1 }, 1_757_000_000);
    const first = account.signMessage.mock.calls[0][0].message;
    account.signMessage.mockClear();

    await buildMerchantRequestBody(account, 'upsert_account', { a: 2 }, 1_757_000_000);
    const second = account.signMessage.mock.calls[0][0].message;

    expect(second).not.toBe(first);
  });

  it('defaults the timestamp to now when none is given', async () => {
    const before = Math.floor(Date.now() / 1000);
    const body = await buildMerchantRequestBody(account, 'upsert_account', {});
    expect(body.timestampSec).toBeGreaterThanOrEqual(before);
  });
});
