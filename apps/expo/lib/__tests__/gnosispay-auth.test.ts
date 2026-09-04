/**
 * SIWE against Gnosis Pay. The message must be EIP-4361 shaped and must name
 * the domain registered in the partner dashboard -- an unregistered domain is
 * rejected server-side. The thirdweb smart account signs it via ERC-1271, which
 * the vendor accepts ("EOAs and Smart Accounts (EIP-1271)").
 *
 * Token storage is covered too: a JWT that is about to expire must read as
 * absent, or a request will fail mid-onboarding.
 */
import {
  GP_SIWE_DOMAIN,
  buildSiweMessage,
  clearToken,
  getStoredToken,
  storeToken,
} from '../gnosispay/auth';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

beforeEach(() => mockStore.clear());

describe('buildSiweMessage', () => {
  const params = {
    domain: GP_SIWE_DOMAIN,
    address: '0xAbC0000000000000000000000000000000000001',
    nonce: 'nonce-123',
    issuedAt: '2026-09-04T10:00:00.000Z',
    uri: 'https://app.roebel.app',
  };

  it('opens with the EIP-4361 domain line', () => {
    expect(buildSiweMessage(params).split('\n')[0]).toBe(
      'app.roebel.app wants you to sign in with your Ethereum account:',
    );
  });

  it('puts the address on its own second line', () => {
    expect(buildSiweMessage(params).split('\n')[1]).toBe(params.address);
  });

  it('defaults to Gnosis chain id 100', () => {
    expect(buildSiweMessage(params)).toContain('Chain ID: 100');
  });

  it('carries the nonce and issued-at verbatim', () => {
    const message = buildSiweMessage(params);
    expect(message).toContain('Nonce: nonce-123');
    expect(message).toContain('Issued At: 2026-09-04T10:00:00.000Z');
  });

  it('honours an explicit chain id when one is given', () => {
    expect(buildSiweMessage({ ...params, chainId: 1 })).toContain('Chain ID: 1');
  });

  it('is stable -- the same inputs produce the same message', () => {
    expect(buildSiweMessage(params)).toBe(buildSiweMessage(params));
  });

  it('registers the app domain, not a placeholder', () => {
    expect(GP_SIWE_DOMAIN).toBe('app.roebel.app');
  });
});

describe('token storage', () => {
  const address = '0xAbC0000000000000000000000000000000000001';

  it('round-trips a token that is still valid', async () => {
    await storeToken(address, 'jwt-1', Date.now() + 60 * 60 * 1000);
    await expect(getStoredToken(address)).resolves.toBe('jwt-1');
  });

  it('is case-insensitive about the address', async () => {
    await storeToken(address, 'jwt-1', Date.now() + 60 * 60 * 1000);
    await expect(getStoredToken(address.toLowerCase())).resolves.toBe('jwt-1');
  });

  it('reports an expired token as absent', async () => {
    await storeToken(address, 'jwt-old', Date.now() - 1000);
    await expect(getStoredToken(address)).resolves.toBeNull();
  });

  it('treats a token inside the refresh slack as absent', async () => {
    await storeToken(address, 'jwt-edge', Date.now() + 30_000);
    await expect(getStoredToken(address)).resolves.toBeNull();
  });

  it('returns null when nothing is stored', async () => {
    await expect(getStoredToken(address)).resolves.toBeNull();
  });

  it('returns null rather than throwing on corrupt storage', async () => {
    mockStore.set(`gp_jwt_${address.toLowerCase()}`, 'not json');
    await expect(getStoredToken(address)).resolves.toBeNull();
  });

  it('clears a stored token', async () => {
    await storeToken(address, 'jwt-1', Date.now() + 60 * 60 * 1000);
    await clearToken(address);
    await expect(getStoredToken(address)).resolves.toBeNull();
  });
});
