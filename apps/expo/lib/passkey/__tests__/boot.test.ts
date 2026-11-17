jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));
jest.mock('expo-updates', () => ({ channel: 'preview' }));
jest.mock('@/lib/supabase-app-settings', () => ({ fetchPasskeyFlags: jest.fn(async () => ({})) }));

import { getAddress, type Hex } from 'viem';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import { bootWallets, retrySource, type BootDeps, type SessionSource } from '../boot';
import { passkeyChannelAllowed } from '../gate';
import { PASSKEY_SESSION_KEY, clearPasskeySession, loadPasskeySession, parsePasskeySession, savePasskeySession, type PasskeySession } from '../session';
import { passkeyWalletOptions, WRONG_CHAIN_MESSAGE } from '../thirdweb-adapter';
import { mem } from '../__testutils__/signin-helpers';

const SESSION: PasskeySession = {
  credentialId: 'cred',
  x: `0x${'11'.repeat(32)}` as Hex,
  y: `0x${'22'.repeat(32)}` as Hex,
  safe: getAddress('0xe3d18fecdcf8e8b656b11340790f7c0147632deb'),
  identity: getAddress('0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28'),
  ownerType: 'sharedSigner',
  owner: SAFE_WEBAUTHN_SHARED_SIGNER,
};

/** A storage spy that records every key touched: thirdweb's keys must never show up. */
function spyStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  const touched: string[] = [];
  return {
    m,
    touched,
    getItem: async (k: string) => (touched.push(`get:${k}`), m.get(k) ?? null),
    setItem: async (k: string, v: string) => void (touched.push(`set:${k}`), m.set(k, v)),
    deleteItem: async (k: string) => void (touched.push(`del:${k}`), m.delete(k)),
  };
}

const NO_SESSION = { outcome: 'no-session', attempts: 1, errors: [], hadStoredSession: false } as const;

function deps(
  over: Partial<BootDeps> & {
    storage?: ReturnType<typeof spyStorage>;
    connect?: jest.Mock;
    hasStored?: () => Promise<boolean>;
    load?: () => Promise<PasskeySession | null>;
  } = {},
) {
  const storage = over.storage ?? spyStorage();
  const connect = over.connect ?? jest.fn(async () => undefined);
  const source: SessionSource<PasskeySession> = {
    owner: 'passkey',
    hasStored: over.hasStored ?? (async () => (await storage.getItem(PASSKEY_SESSION_KEY)) !== null),
    load: over.load ?? (() => loadPasskeySession(storage)),
    connect,
  };
  const d: BootDeps = {
    channelAllowed: () => true,
    sources: [source as SessionSource],
    restoreThirdweb: jest.fn(async () => ({ ...NO_SESSION, errors: [] as string[] })),
    delaysMs: [1, 1, 1],
    sleep: async () => undefined,
    ...over,
  };
  return { d, storage, connect };
}

describe('bootWallets', () => {
  it('a stored passkey session connects the adapter and never runs the thirdweb path', async () => {
    const storage = spyStorage({ [PASSKEY_SESSION_KEY]: JSON.stringify(SESSION) });
    const { d, connect } = deps({ storage });
    expect(await bootWallets(d)).toMatchObject({ owner: 'passkey', result: { outcome: 'restored', attempts: 1 } });
    expect(connect).toHaveBeenCalledWith(SESSION);
    expect(d.restoreThirdweb).not.toHaveBeenCalled();
    expect(new Set(storage.touched)).toEqual(new Set([`get:${PASSKEY_SESSION_KEY}`]));
  });

  it('no session -> the thirdweb restore, unchanged', async () => {
    const { d, storage, connect } = deps();
    expect((await bootWallets(d)).owner).toBe('thirdweb');
    expect(connect).not.toHaveBeenCalled();
    expect(d.restoreThirdweb).toHaveBeenCalledTimes(1);
    expect(new Set(storage.touched)).toEqual(new Set([`get:${PASSKEY_SESSION_KEY}`]));
  });

  it('production channel: reads no storage at all and goes straight to thirdweb', async () => {
    const storage = spyStorage({ [PASSKEY_SESSION_KEY]: JSON.stringify(SESSION) });
    const { d, connect } = deps({ storage, channelAllowed: () => false });
    expect((await bootWallets(d)).owner).toBe('thirdweb');
    expect(storage.touched).toEqual([]);
    expect(connect).not.toHaveBeenCalled();
  });

  it('stored session, connect keeps failing -> failed for passkey, thirdweb is never tried', async () => {
    const storage = spyStorage({ [PASSKEY_SESSION_KEY]: JSON.stringify(SESSION) });
    const { d } = deps({ storage, connect: jest.fn(async () => { throw new Error('rpc down'); }) });
    const r = await bootWallets(d);
    expect(r).toMatchObject({ owner: 'passkey', result: { outcome: 'failed', hadStoredSession: true, attempts: 4 } });
    expect(d.restoreThirdweb).not.toHaveBeenCalled();
  });

  it('storage throws while reading the session -> failed, not logged out', async () => {
    const { d } = deps({ hasStored: async () => { throw new Error('keychain locked'); }, load: async () => { throw new Error('keychain locked'); } });
    expect((await bootWallets(d)).result.outcome).toBe('failed');
    expect(d.restoreThirdweb).not.toHaveBeenCalled();
  });

  it('a storage error behind a dormant thirdweb login never comes up as the thirdweb account', async () => {
    const restoreThirdweb = jest.fn(async () => ({ outcome: 'restored', attempts: 1, errors: [], hadStoredSession: true }) as const);
    const { d } = deps({
      restoreThirdweb,
      hasStored: async () => { throw new Error('keychain locked'); },
      load: async () => { throw new Error('keychain locked'); },
    });
    const r = await bootWallets(d);
    expect(r.owner).toBe('passkey');
    expect(r.result.outcome).toBe('failed');
    expect(restoreThirdweb).not.toHaveBeenCalled();
  });

  it('a corrupt session falls through to thirdweb after ONE attempt', async () => {
    const storage = spyStorage({ [PASSKEY_SESSION_KEY]: '{"broken":true}' });
    const { d } = deps({ storage });
    expect((await bootWallets(d)).owner).toBe('thirdweb');
    expect(d.restoreThirdweb).toHaveBeenCalledTimes(1);
  });

  it('a second attempt that succeeds restores the passkey session', async () => {
    const storage = spyStorage({ [PASSKEY_SESSION_KEY]: JSON.stringify(SESSION) });
    let n = 0;
    const { d } = deps({ storage, connect: jest.fn(async () => { if (n++ === 0) throw new Error('once'); }) });
    expect(await bootWallets(d)).toMatchObject({ owner: 'passkey', result: { outcome: 'restored', attempts: 2 } });
  });

  it('a cancelled boot (unmounted provider) stops before thirdweb', async () => {
    const { d } = deps({ isCancelled: () => true });
    expect((await bootWallets(d)).result.outcome).toBe('cancelled');
    expect(d.restoreThirdweb).not.toHaveBeenCalled();
  });

  it('retrySource makes exactly one attempt', async () => {
    const storage = spyStorage({ [PASSKEY_SESSION_KEY]: JSON.stringify(SESSION) });
    const { d, connect } = deps({ storage, connect: jest.fn(async () => { throw new Error('down'); }) });
    const r = await retrySource(d.sources[0], { sleep: async () => undefined });
    expect(r).toMatchObject({ outcome: 'failed', attempts: 1 });
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe('passkeyChannelAllowed', () => {
  it('is closed on production (also in dev) and without a channel in release', () => {
    expect(passkeyChannelAllowed({ channel: 'production', dev: false })).toBe(false);
    expect(passkeyChannelAllowed({ channel: 'production', dev: true })).toBe(false);
    expect(passkeyChannelAllowed({ channel: null, dev: false })).toBe(false);
  });
  it('is open on preview and in dev clients', () => {
    expect(passkeyChannelAllowed({ channel: 'preview', dev: false })).toBe(true);
    expect(passkeyChannelAllowed({ channel: null, dev: true })).toBe(true);
    expect(passkeyChannelAllowed()).toBe(true); // mocked expo-updates channel = preview
  });
  it('on production restores a session only on a binary that supports passkeys (≥ 3.8.0), no flag needed', () => {
    expect(passkeyChannelAllowed({ channel: 'production', dev: false, runtimeVersion: '3.7.0' })).toBe(false);
    expect(passkeyChannelAllowed({ channel: 'production', dev: false, runtimeVersion: null })).toBe(false);
    expect(passkeyChannelAllowed({ channel: 'production', dev: false, runtimeVersion: '3.8.0' })).toBe(true);
    expect(passkeyChannelAllowed({ channel: 'production', dev: false, runtimeVersion: '3.10.1' })).toBe(true);
    expect(passkeyChannelAllowed({ channel: 'production', dev: true, runtimeVersion: '3.7.9' })).toBe(false);
  });
});

describe('session storage', () => {
  it('round-trips and sign-out deletes ONLY passkey_session_v1', async () => {
    const s = mem();
    s.m.set('passkey_migration_v1', 'keep');
    s.m.set('thirdweb:active-wallet-id', 'inApp');
    await savePasskeySession(s, SESSION);
    expect(await loadPasskeySession(s)).toEqual(SESSION);
    await clearPasskeySession(s);
    expect([...s.m.keys()].sort()).toEqual(['passkey_migration_v1', 'thirdweb:active-wallet-id']);
  });
  it('rejects malformed sessions', () => {
    expect(parsePasskeySession(JSON.stringify({ ...SESSION, ownerType: 'x' }))).toBeNull();
    expect(parsePasskeySession(JSON.stringify({ ...SESSION, x: '0x12' }))).toBeNull();
    expect(parsePasskeySession('nope')).toBeNull();
  });
});

describe('thirdweb adapter wallet', () => {
  it('createWalletAdapter: account = identity, Gnosis only, disconnect clears only the session', async () => {
    // The real thirdweb 5.119.3 implementation (CJS build; jest does not transform thirdweb's ESM).
    const { createWalletAdapter } = require('../../../node_modules/thirdweb/dist/cjs/adapters/wallet-adapter.js');
    const { client, chain } = { client: { clientId: 'test' }, chain: { id: 100, rpc: 'https://rpc.gnosischain.com' } };
    const storage = spyStorage({ [PASSKEY_SESSION_KEY]: JSON.stringify(SESSION), 'thirdweb:active-wallet-id': 'inApp' });
    const opts = passkeyWalletOptions(SESSION, {
      client,
      chain,
      deps: { sign: jest.fn(), isSafeDeployed: jest.fn(), sendUserOp: jest.fn() },
      clearSession: () => clearPasskeySession(storage),
    });
    const wallet = createWalletAdapter(opts);
    expect(wallet.id).toBe('adapter');
    expect(wallet.getAccount().address).toBe(SESSION.identity);
    expect((await wallet.autoConnect({ client })).address).toBe(SESSION.identity);
    await expect(wallet.switchChain({ id: 8453 })).rejects.toThrow(WRONG_CHAIN_MESSAGE);
    await wallet.switchChain({ id: 100 });
    await wallet.disconnect();
    expect(storage.touched).toEqual([`del:${PASSKEY_SESSION_KEY}`]);
    expect(storage.m.get('thirdweb:active-wallet-id')).toBe('inApp');
  });
});
