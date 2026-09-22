/**
 * The Stripe Connect org-side gate. New surface, so a missing key means OFF --
 * the opposite default from the Wochen-Radio switch, which guards a feature that
 * already shipped and should keep working if the row is ever deleted.
 */
import { supabase } from '../supabase';
import { isStripeConnectEnabled, isTicketSalesEnabled } from '../supabase-app-settings';

jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

function stubSetting(value: string | null) {
  (supabase.from as jest.Mock).mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: value === null ? null : { value }, error: null }),
      }),
    }),
  });
}

const globals = global as { __DEV__?: boolean };
const originalDev = globals.__DEV__;

beforeEach(() => {
  globals.__DEV__ = false;
  (supabase.from as jest.Mock).mockReset();
});

afterAll(() => {
  globals.__DEV__ = originalDev;
});

describe('isStripeConnectEnabled', () => {
  it('is off when the key is unset', async () => {
    stubSetting(null);
    await expect(isStripeConnectEnabled()).resolves.toBe(false);
  });

  it('is off when the key is explicitly false', async () => {
    stubSetting('false');
    await expect(isStripeConnectEnabled()).resolves.toBe(false);
  });

  it('is on for everyone when the key is true', async () => {
    stubSetting('true');
    await expect(isStripeConnectEnabled()).resolves.toBe(true);
  });

  it('treats any other value as a wallet allowlist', async () => {
    stubSetting('0xAAA,0xBBB');
    await expect(isStripeConnectEnabled({ walletAddress: '0xaaa' })).resolves.toBe(true);
    await expect(isStripeConnectEnabled({ walletAddress: '0xccc' })).resolves.toBe(false);
  });

  it('ignores whitespace around allowlisted wallets', async () => {
    stubSetting('0xAAA, 0xBBB');
    await expect(isStripeConnectEnabled({ walletAddress: '0xbbb' })).resolves.toBe(true);
  });

  it('is off for an allowlist when no wallet is known', async () => {
    stubSetting('0xAAA');
    await expect(isStripeConnectEnabled()).resolves.toBe(false);
  });

  it('is on in dev builds without touching the network', async () => {
    globals.__DEV__ = true;
    await expect(isStripeConnectEnabled()).resolves.toBe(true);
    expect(supabase.from as jest.Mock).not.toHaveBeenCalled();
  });
});

describe('isTicketSalesEnabled', () => {
  it('is on in dev builds without touching the network', async () => {
    globals.__DEV__ = true;
    await expect(isTicketSalesEnabled()).resolves.toBe(true);
    expect(supabase.from as jest.Mock).not.toHaveBeenCalled();
  });

  it('is on only when the key is exactly true', async () => {
    stubSetting('true');
    await expect(isTicketSalesEnabled()).resolves.toBe(true);
  });

  it('is off for a wallet-like value', async () => {
    stubSetting('0xabc');
    await expect(isTicketSalesEnabled()).resolves.toBe(false);
  });

  it('is off when the key is unset', async () => {
    stubSetting(null);
    await expect(isTicketSalesEnabled()).resolves.toBe(false);
  });
});
