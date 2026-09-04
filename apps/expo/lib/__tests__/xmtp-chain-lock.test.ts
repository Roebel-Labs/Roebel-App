/**
 * The chain-lock module turns XMTP's "Wrong chain id" rejection into a durable
 * per-wallet marker so the app stops attempting an impossible registration.
 */
import {
  XmtpChainLockedError,
  clearXmtpChainLock,
  getXmtpChainLock,
  parseForeignChainLock,
  setXmtpChainLock,
} from '../xmtp/chain-lock';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockStore.delete(k);
    }),
  },
}));

beforeEach(() => mockStore.clear());

/** The exact text captured from logcat on Max's Pixel, 2026-09-04. */
const LIVE_MESSAGE =
  "Call to function 'XMTP.create' has been rejected.\n→ Caused by: org.xmtp.android.library.XMTPException: " +
  'Error creating V3 client: [ClientError::Api] Client error: API error: api client error api client at endpoint ' +
  '"/xmtp.identity.api.v1.IdentityApi/PublishIdentityUpdate" has error status: \'Client specified an invalid argument\', ' +
  'self: "Wrong chain id. Initially added with 8453 but now signing from 100", metadata: {"content-type": "application/grpc"}.';

describe('parseForeignChainLock', () => {
  it('recognises the live rejection text and extracts both chains', () => {
    expect(parseForeignChainLock(new Error(LIVE_MESSAGE))).toEqual({
      boundChainId: 8453,
      signingChainId: 100,
    });
  });

  it('accepts a bare string', () => {
    expect(parseForeignChainLock('Initially added with 1 but now signing from 100')).toEqual({
      boundChainId: 1,
      signingChainId: 100,
    });
  });

  it('accepts an object with a message', () => {
    expect(
      parseForeignChainLock({ message: 'x Initially added with 8453 but now signing from 100 y' }),
    ).toEqual({ boundChainId: 8453, signingChainId: 100 });
  });

  it('is null for unrelated errors', () => {
    expect(parseForeignChainLock(new Error('network unreachable'))).toBeNull();
    expect(parseForeignChainLock(null)).toBeNull();
    expect(parseForeignChainLock(undefined)).toBeNull();
    expect(parseForeignChainLock(42)).toBeNull();
  });

  it('is null when both chains are the same (not a lock, something else)', () => {
    expect(parseForeignChainLock('Initially added with 100 but now signing from 100')).toBeNull();
  });
});

describe('chain-lock storage', () => {
  const wallet = '0xC49dE63CcfEe46C6c5C3e393293f66779799fB28';

  it('round-trips a lock and is case-insensitive about the wallet', async () => {
    await setXmtpChainLock(wallet, 8453);
    await expect(getXmtpChainLock(wallet.toLowerCase())).resolves.toBe(8453);
    await expect(getXmtpChainLock(wallet.toUpperCase())).resolves.toBe(8453);
  });

  it('is null when nothing is stored', async () => {
    await expect(getXmtpChainLock(wallet)).resolves.toBeNull();
  });

  it('treats corrupt storage as no lock rather than throwing', async () => {
    mockStore.set('@xmtp_chain_locked_' + wallet.toLowerCase(), 'not-a-number');
    await expect(getXmtpChainLock(wallet)).resolves.toBeNull();
  });

  it('clears a lock', async () => {
    await setXmtpChainLock(wallet, 8453);
    await clearXmtpChainLock(wallet);
    await expect(getXmtpChainLock(wallet)).resolves.toBeNull();
  });
});

describe('XmtpChainLockedError', () => {
  it('carries the bound chain and survives instanceof', () => {
    const err = new XmtpChainLockedError(8453);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(XmtpChainLockedError);
    expect(err.boundChainId).toBe(8453);
    expect(err.name).toBe('XmtpChainLockedError');
  });
});
