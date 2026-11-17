const mockGetItem = jest.fn<Promise<string | null>, [string]>();
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: (k: string) => mockGetItem(k),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
// The real sign-in runtime is never imported by these tests (loadRuntime is injected).
jest.mock('../signin-runtime', () => {
  throw new Error('signin-runtime must not be imported by the presence check');
});

import { bootWallets, type BootDeps } from '../boot';
import { hasStoredPasskeySession, passkeyBootSource } from '../boot-source';
import { PASSKEY_SESSION_KEY } from '../session';

const RESTORED = { outcome: 'restored', attempts: 1, errors: [], hadStoredSession: true } as const;
const setActiveWallet = jest.fn(async () => undefined);

beforeEach(() => mockGetItem.mockReset());

describe('passkeyBootSource wiring (real SecureStore read)', () => {
  it('present key -> stored, read straight from SecureStore without loading the runtime', async () => {
    mockGetItem.mockResolvedValue('{"any":"thing"}');
    const loadRuntime = jest.fn();
    expect(await passkeyBootSource(setActiveWallet, { loadRuntime }).hasStored()).toBe(true);
    expect(mockGetItem).toHaveBeenCalledWith(PASSKEY_SESSION_KEY);
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it('absent key -> not stored', async () => {
    mockGetItem.mockResolvedValue(null);
    expect(await passkeyBootSource(setActiveWallet, { loadRuntime: jest.fn() }).hasStored()).toBe(false);
    expect(await hasStoredPasskeySession()).toBe(false);
  });

  it('a throwing getItem throws (the boot counts that as stored, never as logged out)', async () => {
    mockGetItem.mockRejectedValue(new Error('keychain locked'));
    await expect(passkeyBootSource(setActiveWallet, { loadRuntime: jest.fn() }).hasStored()).rejects.toThrow('keychain locked');
  });

  it('the runtime import throws + no stored key -> the thirdweb login is restored', async () => {
    mockGetItem.mockResolvedValue(null);
    const loadRuntime = jest.fn(async () => {
      throw new Error('native module missing');
    });
    const restoreThirdweb = jest.fn(async () => RESTORED);
    const d: BootDeps = {
      channelAllowed: () => true,
      sources: [passkeyBootSource(setActiveWallet, { loadRuntime })],
      restoreThirdweb,
      delaysMs: [1, 1, 1],
      sleep: async () => undefined,
    };
    expect(await bootWallets(d)).toEqual({ owner: 'thirdweb', result: RESTORED });
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it('the runtime import throws + a stored key -> failed for passkey (retried), thirdweb not tried', async () => {
    mockGetItem.mockResolvedValue('{"any":"thing"}');
    const loadRuntime = jest.fn(async () => {
      throw new Error('native module missing');
    });
    const restoreThirdweb = jest.fn(async () => RESTORED);
    const r = await bootWallets({
      channelAllowed: () => true,
      sources: [passkeyBootSource(setActiveWallet, { loadRuntime })],
      restoreThirdweb,
      delaysMs: [1, 1, 1],
      sleep: async () => undefined,
    });
    expect(r).toMatchObject({ owner: 'passkey', result: { outcome: 'failed', attempts: 4 } });
    expect(restoreThirdweb).not.toHaveBeenCalled();
  });

  it('a stored key loads the runtime and connects through its source', async () => {
    mockGetItem.mockResolvedValue('{"any":"thing"}');
    const connect = jest.fn(async () => undefined);
    const runtimeSource = { owner: 'passkey' as const, hasStored: jest.fn(), load: jest.fn(async () => ({ s: 1 })), connect };
    const passkeySessionSource = jest.fn(() => runtimeSource);
    const r = await bootWallets({
      channelAllowed: () => true,
      sources: [passkeyBootSource(setActiveWallet, { loadRuntime: async () => ({ passkeySessionSource }) as never })],
      restoreThirdweb: jest.fn(async () => RESTORED),
      delaysMs: [],
      sleep: async () => undefined,
    });
    expect(r).toMatchObject({ owner: 'passkey', result: { outcome: 'restored' } });
    expect(passkeySessionSource).toHaveBeenCalledWith(setActiveWallet);
    expect(connect).toHaveBeenCalledWith({ s: 1 });
    expect(runtimeSource.hasStored).not.toHaveBeenCalled();
  });
});
