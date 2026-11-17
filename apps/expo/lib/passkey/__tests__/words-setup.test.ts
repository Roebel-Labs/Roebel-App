import { getAddress, type Address, type Hex } from 'viem';
import { SLOT_LABEL } from '../derived-keys';
import { utf8Encode } from '../encoding';
import { SOCIAL_RECOVERY_SENTINEL } from '../constants';
import { encodeAddGuardian, encodeRevokeGuardian } from '../guardians';
import type { KeyBackupBlobs, KeyBackupSlot, RemoteBackup, RemoteRead } from '../key-backup';
import { unwrapSecret, wrapSecret } from '../prf-vault';
import type { SponsoredCall } from '../userop';
import { deriveWordAddresses, wordsVaultKey } from '../words';
import { loadWordsPool, saveWordsPool, WORDS_THRESHOLD_LIMIT_MESSAGE, type WordsPool } from '../words-guardians';
import {
  currentWordsPool,
  disableRecoveryWords,
  enableRecoveryWords,
  loadWordsPending,
  readWordsStatus,
  retryWordsBackup,
  syncWordsPool,
  WORDS_ELSEWHERE_MESSAGE,
  WORDS_PENDING_KEY,
  WORDS_STATUS_CHECKING_MESSAGE,
  type WordsSetupDeps,
} from '../words-setup';
import { loadVaultKey, resolveVaultKey, saveVaultKey, unwrapWordsVault, WORDS_NO_WVK_BLOB, WORDS_OFF_BLOB, wrapVaultKey } from '../words-vault';

const JUNK = 'test test test test test test test test test test test junk';
const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SAFE = getAddress('0x5afe00000000000000000000000000000000beef');
const P1 = getAddress('0x1111111111111111111111111111111111111111');
const P2 = getAddress('0x2222222222222222222222222222222222222222');
const P3 = getAddress('0x3333333333333333333333333333333333333333');
const PRF = `0x${'42'.repeat(32)}` as Hex;
const NEW = deriveWordAddresses(JUNK);
const OLD = deriveWordAddresses(ABOUT);

function deps(o: {
  state: { guardians: Address[]; threshold: number };
  pool?: WordsPool;
  vaultKey?: Hex;
  secrets?: { slot: KeyBackupSlot; secret: Uint8Array }[];
  sendOp?: (calls: SponsoredCall[]) => Promise<Hex>;
  prf?: Hex | null;
  server?: KeyBackupBlobs;
  readPrf?: Hex;
  writeResult?: 'stored' | 'exists' | 'throw';
  /** A cached session token: `readWithoutPrompt` answers (without a PRF). */
  token?: boolean;
  getPrfThrows?: boolean;
}) {
  const kv = new Map<string, string>();
  const vault = new Map<string, string>();
  const server: KeyBackupBlobs = { ...(o.server ?? {}) };
  const written: KeyBackupBlobs[] = [];
  const replaces: (boolean | undefined)[] = [];
  const storage = {
    getItem: async (k: string) => kv.get(k) ?? null,
    setItem: async (k: string, v: string) => void kv.set(k, v),
    removeItem: async (k: string) => void kv.delete(k),
  };
  const vaultStorage = {
    getItem: async (k: string) => vault.get(k) ?? null,
    setItem: async (k: string, v: string) => void vault.set(k, v),
    deleteItem: async (k: string) => void vault.delete(k),
  };
  const remote: RemoteBackup = {
    read: jest.fn(async (): Promise<RemoteRead> => {
      const p = o.readPrf ? { prf: o.readPrf } : {};
      return Object.keys(server).length ? { status: 'found', blobs: { ...server }, ...p } : { status: 'none', ...p };
    }),
    ...(o.token
      ? {
          readWithoutPrompt: jest.fn(async (): Promise<RemoteRead> =>
            Object.keys(server).length ? { status: 'found', blobs: { ...server } } : { status: 'none' },
          ),
        }
      : {}),
    write: jest.fn(async (b: KeyBackupBlobs, replace?: boolean) => {
      written.push(b);
      replaces.push(replace);
      if (o.writeResult === 'throw') throw new Error('offline');
      if (o.writeResult === 'exists') return 'exists' as const;
      Object.assign(server, b);
      return 'stored' as const;
    }),
  };
  const sendOp = jest.fn(o.sendOp ?? (async () => '0xabc' as Hex));
  const getPrf = jest.fn(async () => {
    if (o.getPrfThrows) throw new Error('cancelled');
    return o.prf === undefined ? PRF : o.prf;
  });
  const d: WordsSetupDeps = {
    storage,
    vaultStorage,
    readState: async () => ({ guardians: [...o.state.guardians], threshold: o.state.threshold }),
    sendOp,
    deviceSecrets: async () => o.secrets ?? [],
    remote,
    getPrf,
    wrap: wrapSecret,
    unwrap: unwrapSecret,
    now: () => 1000,
  };
  const ready = (async () => {
    if (o.pool) await saveWordsPool(storage, o.pool);
    if (o.vaultKey) await saveVaultKey(vaultStorage, o.vaultKey);
  })();
  return {
    ready,
    deps: d,
    storage,
    vaultStorage,
    sendOp,
    getPrf,
    remote,
    server,
    written,
    replaces,
    storageDump: () => [...kv.entries()],
    vaultDump: () => [...vault.entries()],
  };
}

async function setup(o: Parameters<typeof deps>[0]) {
  const d = deps(o);
  await d.ready;
  return d;
}

describe('enableRecoveryWords', () => {
  it('enable: one op, then pool, vault key and copies; the phrase is stored nowhere', async () => {
    const d = await setup({ state: { guardians: [P1], threshold: 1 }, secrets: [{ slot: 'maci', secret: utf8Encode('m') }] });
    const r = await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps);
    expect(r).toMatchObject({ status: 'done', wordCount: 1, copies: { stored: ['maci'], failed: [] } });
    expect(d.sendOp).toHaveBeenCalledTimes(1);
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(deriveWordAddresses(JUNK)[0], 1)]);
    expect((await loadWordsPool(d.storage))!.addresses).toEqual(deriveWordAddresses(JUNK));
    expect(await loadVaultKey(d.vaultStorage)).toBe(wordsVaultKey(JUNK));
    expect(JSON.stringify([...d.storageDump(), ...d.vaultDump(), ...d.written])).not.toContain('junk');
    expect(Object.keys(d.written[0])).toEqual(['maci_w', 'wvk']);
  });

  it('a failed op stores nothing', async () => {
    const d = await setup({ state: { guardians: [], threshold: 0 }, sendOp: async () => { throw new Error('userOp reverted'); } });
    expect((await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps)).status).toBe('error');
    expect(await loadWordsPool(d.storage)).toBeNull();
    expect(await loadVaultKey(d.vaultStorage)).toBeNull();
    expect(await loadWordsPending(d.storage)).toBeNull();
    expect(d.written).toHaveLength(0);
  });

  it('a failed op restores what this device had before (old pool, vault key, pending)', async () => {
    const d = await setup({ state: { guardians: [OLD[0]], threshold: 1 }, pool: { addresses: OLD, confirmedAt: 1 }, vaultKey: wordsVaultKey(ABOUT), sendOp: async () => { throw new Error('x'); } });
    expect((await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps)).status).toBe('error');
    expect((await loadWordsPool(d.storage))!.addresses).toEqual(OLD);
    expect(await loadVaultKey(d.vaultStorage)).toBe(wordsVaultKey(ABOUT));
    expect(await loadWordsPending(d.storage)).toBeNull();
  });

  it('pool, vault key and pending "on" are saved BEFORE the op (a crash after it loses nothing)', async () => {
    let seen: unknown[] = [];
    const d = await setup({ state: { guardians: [], threshold: 0 } });
    d.sendOp.mockImplementation(async () => {
      seen = [(await loadWordsPool(d.storage))?.addresses, await loadVaultKey(d.vaultStorage), await loadWordsPending(d.storage)];
      return '0xabc' as Hex;
    });
    await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps);
    expect(seen).toEqual([NEW, wordsVaultKey(JUNK), 'on']);
  });

  it('an op that reports an error but landed counts as done (no error screen after success)', async () => {
    const state = { guardians: [] as Address[], threshold: 0 };
    const d = await setup({ state });
    d.deps.readState = jest.fn().mockResolvedValueOnce({ guardians: [], threshold: 0 }).mockResolvedValue({ guardians: [NEW[0]], threshold: 1 });
    d.sendOp.mockRejectedValue(new Error('receipt timeout'));
    expect(await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps)).toMatchObject({ status: 'done' });
    expect((await loadWordsPool(d.storage))!.addresses).toEqual(NEW);
  });

  it('a storage error after the op still reports done', async () => {
    const d = await setup({ state: { guardians: [], threshold: 0 } });
    d.storage.removeItem = async () => { throw new Error('disk'); };
    expect((await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps)).status).toBe('done');
  });

  it('replace revokes the old word guardians and adds the new ones in the same op', async () => {
    const old = deriveWordAddresses(ABOUT);
    const d = await setup({ state: { guardians: [old[0]], threshold: 1 }, pool: { addresses: old, confirmedAt: 1 } });
    await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps);
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(deriveWordAddresses(JUNK)[0], 1), encodeRevokeGuardian(deriveWordAddresses(JUNK)[0], old[0], 1)]);
  });

  it('the _w copies and wvk go in ONE replace:true write; wvk holds the vault key AND the 5 public pool addresses', async () => {
    const d = await setup({
      state: { guardians: [P1, P2], threshold: 2 },
      secrets: [
        { slot: 'maci', secret: utf8Encode('m') },
        { slot: 'nostr', secret: utf8Encode('n') },
        { slot: 'salt', secret: utf8Encode('s') },
      ],
    });
    const r = await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps);
    expect(r).toMatchObject({ status: 'done', wordCount: 2, wvkStored: true });
    expect(d.written).toHaveLength(1);
    expect(d.replaces).toEqual([true]);
    expect(Object.keys(d.written[0])).toEqual(['maci_w', 'nostr_w', 'salt_w', 'wvk']);
    expect(await unwrapWordsVault(PRF, d.written[0].wvk!, unwrapSecret)).toEqual({ vaultKey: wordsVaultKey(JUNK), addresses: NEW });
    expect(await unwrapSecret(wordsVaultKey(JUNK), SLOT_LABEL.salt, d.written[0].salt_w!)).toEqual(utf8Encode('s'));
    expect(d.getPrf).toHaveBeenCalledTimes(1);
    expect(await loadWordsPending(d.storage)).toBeNull();
  });

  it('a stricter choice ("Alle 3") survives: as many word guardians as the on-chain threshold', async () => {
    const d = await setup({ state: { guardians: [P1, P2, P3], threshold: 3 } });
    const r = await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps);
    expect(r).toMatchObject({ status: 'done', wordCount: 3 });
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(NEW[0], 3), encodeAddGuardian(NEW[1], 3), encodeAddGuardian(NEW[2], 3)]);
  });

  it('no guardians yet: the default threshold (one word guardian)', async () => {
    const d = await setup({ state: { guardians: [], threshold: 0 } });
    expect(await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps)).toMatchObject({ status: 'done', wordCount: 1 });
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(NEW[0], 1)]);
  });

  it('a threshold above 5 cannot be reached by the words: German error, no op', async () => {
    const six = [1, 2, 3, 4, 5, 6].map((i) => getAddress(`0x${String(i).repeat(40)}`));
    const d = await setup({ state: { guardians: six, threshold: 6 } });
    expect(await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps)).toEqual({ status: 'error', message: WORDS_THRESHOLD_LIMIT_MESSAGE });
    expect(d.sendOp).not.toHaveBeenCalled();
  });

  it('an invalid phrase never reaches the chain', async () => {
    const d = await setup({ state: { guardians: [], threshold: 0 } });
    const r = await enableRecoveryWords({ safe: SAFE, phrase: 'test test test' }, d.deps);
    expect(r.status).toBe('error');
    expect(d.sendOp).not.toHaveBeenCalled();
  });

  it('no PRF on this authenticator (replace): the no-wvk marker replaces the OLD wvk in the same write; nothing pending (a retry cannot help)', async () => {
    const oldWvk = await wrapVaultKey(PRF, wordsVaultKey(ABOUT), wrapSecret, OLD);
    const d = await setup({
      state: { guardians: [OLD[0]], threshold: 1 },
      pool: { addresses: OLD, confirmedAt: 1 },
      prf: null,
      server: { wvk: oldWvk },
      secrets: [{ slot: 'maci', secret: utf8Encode('m') }],
    });
    const r = await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps);
    expect(r).toMatchObject({ status: 'done', copies: { stored: ['maci'], failed: [] }, wvkStored: false });
    expect(Object.keys(d.written[0])).toEqual(['maci_w', 'wvk']);
    expect(d.replaces).toEqual([true]);
    expect(d.server.wvk).toBe(WORDS_NO_WVK_BLOB);
    expect(await loadWordsPending(d.storage)).toBeNull();
    // no phone can follow the old words any more
    expect(await resolveVaultKey({ storage: d.vaultStorage, wvkBlob: d.server.wvk, prf: PRF, unwrap: unwrapSecret })).toBeNull();
  });

  it('a failed PRF prompt (replace): the no-wvk marker still replaces the old wvk, and it stays pending "on" for a retry', async () => {
    const oldWvk = await wrapVaultKey(PRF, wordsVaultKey(ABOUT), wrapSecret, OLD);
    const d = await setup({ state: { guardians: [OLD[0]], threshold: 1 }, pool: { addresses: OLD, confirmedAt: 1 }, getPrfThrows: true, server: { wvk: oldWvk } });
    const r = await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps);
    expect(r).toMatchObject({ status: 'done', wvkStored: false });
    expect(d.server.wvk).toBe(WORDS_NO_WVK_BLOB);
    expect(await loadWordsPending(d.storage)).toBe('on');
  });

  it('a failed backup write: the account is protected, copies reported failed, and marked pending for a retry', async () => {
    const d = await setup({ state: { guardians: [], threshold: 0 }, writeResult: 'throw', secrets: [{ slot: 'maci', secret: utf8Encode('m') }] });
    const r = await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps);
    expect(r).toMatchObject({ status: 'done', copies: { stored: [], failed: ['maci'] }, wvkStored: false });
    expect(await loadWordsPending(d.storage)).toBe('on');
    expect(await loadVaultKey(d.vaultStorage)).toBe(wordsVaultKey(JUNK));
  });

  it('a phone without the pool learns the old one from the server wvk (read PRF reused) and revokes the old words', async () => {
    const oldWvk = await wrapVaultKey(PRF, wordsVaultKey(ABOUT), wrapSecret, OLD);
    const d = await setup({ state: { guardians: [P1, OLD[0]], threshold: 1 }, server: { wvk: oldWvk }, readPrf: PRF });
    const r = await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps);
    expect(r).toMatchObject({ status: 'done', wordCount: 1 });
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(NEW[0], 1), encodeRevokeGuardian(P1, OLD[0], 1)]);
    expect(d.getPrf).not.toHaveBeenCalled();
    expect(await unwrapWordsVault(PRF, d.server.wvk!, unwrapSecret)).toEqual({ vaultKey: wordsVaultKey(JUNK), addresses: NEW });
  });

  it('a cached session token: the old pool is read without a proof (no signed read); the unwrap PRF is reused for the new wvk', async () => {
    const oldWvk = await wrapVaultKey(PRF, wordsVaultKey(ABOUT), wrapSecret, OLD);
    const d = await setup({ state: { guardians: [P1, OLD[0]], threshold: 1 }, server: { wvk: oldWvk }, token: true });
    expect(await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps)).toMatchObject({ status: 'done' });
    expect(d.remote.read).not.toHaveBeenCalled();
    expect(d.remote.readWithoutPrompt).toHaveBeenCalledTimes(1);
    expect(d.getPrf).toHaveBeenCalledTimes(1);
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(NEW[0], 1), encodeRevokeGuardian(P1, OLD[0], 1)]);
  });

  it('a cached token and no words on the server: no proof and no PRF before the op', async () => {
    const d = await setup({ state: { guardians: [P1], threshold: 1 }, token: true });
    await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps);
    expect(d.remote.read).not.toHaveBeenCalled();
    expect(d.getPrf).toHaveBeenCalledTimes(1); // only for the new wvk, after the op
  });

  it('the local pool is used as is: no backup read before the op', async () => {
    const d = await setup({ state: { guardians: [OLD[0]], threshold: 1 }, pool: { addresses: OLD, confirmedAt: 1 } });
    await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps);
    expect(d.remote.read).not.toHaveBeenCalled();
  });
});

describe('disableRecoveryWords', () => {
  it('disable revokes the word guardians and forgets pool and vault key', async () => {
    const pool = { addresses: deriveWordAddresses(JUNK), confirmedAt: 1 };
    const d = await setup({ state: { guardians: [pool.addresses[0], P1], threshold: 1 }, pool, vaultKey: wordsVaultKey(JUNK) });
    expect((await disableRecoveryWords({ safe: SAFE }, d.deps)).status).toBe('done');
    expect(await loadWordsPool(d.storage)).toBeNull();
    expect(await loadVaultKey(d.vaultStorage)).toBeNull();
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, pool.addresses[0], 1)]);
  });

  it('leaves no usable wvk: the off marker goes into wvk and every _w slot in ONE replace:true write', async () => {
    const pool = { addresses: NEW, confirmedAt: 1 };
    const d = await setup({ state: { guardians: [NEW[0], NEW[1], P1, P2], threshold: 2 }, pool, vaultKey: wordsVaultKey(JUNK) });
    expect(await disableRecoveryWords({ safe: SAFE }, d.deps)).toEqual({ status: 'done', backupCleared: true });
    expect(d.written).toEqual([{ maci_w: WORDS_OFF_BLOB, nostr_w: WORDS_OFF_BLOB, salt_w: WORDS_OFF_BLOB, wvk: WORDS_OFF_BLOB }]);
    expect(d.replaces).toEqual([true]);
    expect(d.getPrf).not.toHaveBeenCalled();
    // another phone with a stale device key now follows the server: words off
    const other = new Map<string, string>();
    const otherStorage = { getItem: async (k: string) => other.get(k) ?? null, setItem: async (k: string, v: string) => void other.set(k, v), deleteItem: async (k: string) => void other.delete(k) };
    await saveVaultKey(otherStorage, wordsVaultKey(JUNK));
    expect(await resolveVaultKey({ storage: otherStorage, wvkBlob: d.server.wvk, prf: PRF, unwrap: unwrapSecret })).toBeNull();
    expect(await loadVaultKey(otherStorage)).toBeNull();
  });

  it('keeps the people and their threshold', async () => {
    const pool = { addresses: NEW, confirmedAt: 1 };
    const d = await setup({ state: { guardians: [NEW[1], NEW[0], P1, P2], threshold: 2 }, pool });
    await disableRecoveryWords({ safe: SAFE }, d.deps);
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, NEW[1], 2), encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, NEW[0], 2)]);
  });

  it('a failed op changes nothing', async () => {
    const pool = { addresses: NEW, confirmedAt: 1 };
    const d = await setup({ state: { guardians: [NEW[0]], threshold: 1 }, pool, vaultKey: wordsVaultKey(JUNK), sendOp: async () => { throw new Error('x'); } });
    expect((await disableRecoveryWords({ safe: SAFE }, d.deps)).status).toBe('error');
    expect(await loadWordsPool(d.storage)).not.toBeNull();
    expect(d.written).toHaveLength(0);
  });

  it('a failed marker write: still done on chain, marked pending; the retry writes the marker', async () => {
    const pool = { addresses: NEW, confirmedAt: 1 };
    const d = await setup({ state: { guardians: [NEW[0]], threshold: 1 }, pool, writeResult: 'throw' });
    expect(await disableRecoveryWords({ safe: SAFE }, d.deps)).toEqual({ status: 'done', backupCleared: false });
    expect(await loadWordsPending(d.storage)).toBe('off');
    const ok = await setup({ state: { guardians: [], threshold: 1 } });
    await ok.storage.setItem(WORDS_PENDING_KEY, 'off');
    expect(await retryWordsBackup({ safe: SAFE }, ok.deps)).toEqual({ status: 'done' });
    expect(ok.written).toEqual([{ maci_w: WORDS_OFF_BLOB, nostr_w: WORDS_OFF_BLOB, salt_w: WORDS_OFF_BLOB, wvk: WORDS_OFF_BLOB }]);
    expect(await loadWordsPending(ok.storage)).toBeNull();
  });

  it('a phone without the pool reads it from the server wvk before revoking', async () => {
    const wvk = await wrapVaultKey(PRF, wordsVaultKey(JUNK), wrapSecret, NEW);
    const d = await setup({ state: { guardians: [NEW[0], P1], threshold: 1 }, server: { wvk }, readPrf: PRF });
    expect((await disableRecoveryWords({ safe: SAFE }, d.deps)).status).toBe('done');
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, NEW[0], 1)]);
  });

  it('nothing to remove (no word guardian known) → German error, no op', async () => {
    const d = await setup({ state: { guardians: [P1], threshold: 1 } });
    expect((await disableRecoveryWords({ safe: SAFE }, d.deps)).status).toBe('error');
    expect(d.sendOp).not.toHaveBeenCalled();
  });
});

describe('retryWordsBackup / readWordsStatus', () => {
  it('pending "on": rewrites the copies and wvk from the stored vault key and pool (no phrase needed)', async () => {
    const d = await setup({
      state: { guardians: [NEW[0]], threshold: 1 },
      pool: { addresses: NEW, confirmedAt: 1 },
      vaultKey: wordsVaultKey(JUNK),
      secrets: [{ slot: 'nostr', secret: utf8Encode('n') }],
    });
    await d.storage.setItem(WORDS_PENDING_KEY, 'on');
    expect(await retryWordsBackup({ safe: SAFE }, d.deps)).toEqual({ status: 'done' });
    expect(Object.keys(d.written[0])).toEqual(['nostr_w', 'wvk']);
    expect(d.replaces).toEqual([true]);
    expect(await unwrapWordsVault(PRF, d.written[0].wvk!, unwrapSecret)).toEqual({ vaultKey: wordsVaultKey(JUNK), addresses: NEW });
    expect(await loadWordsPending(d.storage)).toBeNull();
  });

  it('a retry that fails again keeps it pending', async () => {
    const d = await setup({ state: { guardians: [NEW[0]], threshold: 1 }, pool: { addresses: NEW, confirmedAt: 1 }, vaultKey: wordsVaultKey(JUNK), writeResult: 'exists' });
    await d.storage.setItem(WORDS_PENDING_KEY, 'on');
    expect((await retryWordsBackup({ safe: SAFE }, d.deps)).status).toBe('error');
    expect(await loadWordsPending(d.storage)).toBe('on');
  });

  it('stale "on" (the words were replaced elsewhere: no local word address is a guardian): nothing written, local words dropped', async () => {
    const d = await setup({ state: { guardians: [OLD[0]], threshold: 1 }, pool: { addresses: NEW, confirmedAt: 1 }, vaultKey: wordsVaultKey(JUNK) });
    await d.storage.setItem(WORDS_PENDING_KEY, 'on');
    expect(await retryWordsBackup({ safe: SAFE }, d.deps)).toEqual({ status: 'done' });
    expect(d.written).toHaveLength(0);
    expect(await loadWordsPending(d.storage)).toBeNull();
    expect(await loadWordsPool(d.storage)).toBeNull();
    expect(await loadVaultKey(d.vaultStorage)).toBeNull();
  });

  it('stale "off" (words re-enabled elsewhere: the server wvk is another vault key): no marker written, pending dropped', async () => {
    const pool = { addresses: NEW, confirmedAt: 1 };
    const failing = await setup({ state: { guardians: [NEW[0]], threshold: 1 }, pool, vaultKey: wordsVaultKey(JUNK), writeResult: 'throw' });
    await disableRecoveryWords({ safe: SAFE }, failing.deps);
    const raw = await failing.storage.getItem(WORDS_PENDING_KEY);
    expect(raw).toMatch(/^off:[0-9a-f]{64}$/);
    const newer = await wrapVaultKey(PRF, wordsVaultKey(ABOUT), wrapSecret, OLD);
    const d = await setup({ state: { guardians: [OLD[0]], threshold: 1 }, server: { wvk: newer }, readPrf: PRF });
    await d.storage.setItem(WORDS_PENDING_KEY, raw!);
    expect(await retryWordsBackup({ safe: SAFE }, d.deps)).toEqual({ status: 'done' });
    expect(d.written).toHaveLength(0);
    expect(d.server.wvk).toBe(newer);
    expect(await loadWordsPending(d.storage)).toBeNull();
  });

  it('"off" whose server wvk still unwraps to the switched-off key: the marker is written', async () => {
    const pool = { addresses: NEW, confirmedAt: 1 };
    const failing = await setup({ state: { guardians: [NEW[0]], threshold: 1 }, pool, vaultKey: wordsVaultKey(JUNK), writeResult: 'throw' });
    await disableRecoveryWords({ safe: SAFE }, failing.deps);
    const same = await wrapVaultKey(PRF, wordsVaultKey(JUNK), wrapSecret, NEW);
    const d = await setup({ state: { guardians: [], threshold: 1 }, server: { wvk: same }, readPrf: PRF });
    await d.storage.setItem(WORDS_PENDING_KEY, (await failing.storage.getItem(WORDS_PENDING_KEY))!);
    expect(await retryWordsBackup({ safe: SAFE }, d.deps)).toEqual({ status: 'done' });
    expect(d.server.wvk).toBe(WORDS_OFF_BLOB);
  });

  it('status: on only when a word address of the local pool is a guardian on chain', async () => {
    const pool = { addresses: NEW, confirmedAt: 1 };
    expect(await readWordsStatus(SAFE, (await setup({ state: { guardians: [NEW[0], P1], threshold: 1 }, pool })).deps)).toEqual({ on: true, pending: null, unknown: false });
    // An outdated pool (none of it on chain) is no pool: without a token read the guardian is unknown.
    expect(await readWordsStatus(SAFE, (await setup({ state: { guardians: [P1], threshold: 1 }, pool })).deps)).toEqual({ on: false, pending: null, unknown: true });
    expect(await readWordsStatus(SAFE, (await setup({ state: { guardians: [NEW[0]], threshold: 1 } })).deps)).toEqual({ on: false, pending: null, unknown: true });
    expect(await readWordsStatus(SAFE, (await setup({ state: { guardians: [P1], threshold: 1 }, token: true })).deps)).toEqual({ on: false, pending: null, unknown: false });
  });
});

describe('enable: rollback only when the op positively did not land (L2, L3)', () => {
  it('op error + an unreadable chain: the new pool, vault key and pending "on" stay; neutral "Status wird geprüft"', async () => {
    const d = await setup({ state: { guardians: [OLD[0]], threshold: 1 }, pool: { addresses: OLD, confirmedAt: 1 }, vaultKey: wordsVaultKey(ABOUT) });
    d.deps.readState = jest.fn().mockResolvedValueOnce({ guardians: [OLD[0]], threshold: 1 }).mockRejectedValue(new Error('rpc'));
    d.sendOp.mockRejectedValue(new Error('receipt timeout'));
    expect(await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps)).toEqual({ status: 'checking', message: WORDS_STATUS_CHECKING_MESSAGE });
    expect((await loadWordsPool(d.storage))!.addresses).toEqual(NEW);
    expect(await loadVaultKey(d.vaultStorage)).toBe(wordsVaultKey(JUNK));
    expect(await loadWordsPending(d.storage)).toBe('on');
    expect(d.written).toHaveLength(0);
  });

  it('a partial save before the op is rolled back: the old pool and vault key survive, no op', async () => {
    const d = await setup({ state: { guardians: [OLD[0]], threshold: 1 }, pool: { addresses: OLD, confirmedAt: 1 }, vaultKey: wordsVaultKey(ABOUT) });
    const realSet = d.vaultStorage.setItem;
    let failNext = true;
    d.vaultStorage.setItem = async (k: string, v: string) => {
      if (failNext) {
        failNext = false;
        throw new Error('keychain');
      }
      return realSet(k, v);
    };
    expect((await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps)).status).toBe('error');
    expect(d.sendOp).not.toHaveBeenCalled();
    expect((await loadWordsPool(d.storage))!.addresses).toEqual(OLD);
    expect(await loadVaultKey(d.vaultStorage)).toBe(wordsVaultKey(ABOUT));
    expect(await loadWordsPending(d.storage)).toBeNull();
  });
});

describe('pool authority (I1)', () => {
  it('an outdated local pool (replaced on another phone) is not trusted: the server wvk names the current words, which are revoked', async () => {
    // This phone still holds OLD; another phone set NEW (guardians: P1 + NEW[0]).
    const newWvk = await wrapVaultKey(PRF, wordsVaultKey(JUNK), wrapSecret, NEW);
    const d = await setup({ state: { guardians: [P1, NEW[0]], threshold: 1 }, pool: { addresses: OLD, confirmedAt: 1 }, server: { wvk: newWvk }, readPrf: PRF });
    expect(await enableRecoveryWords({ safe: SAFE, phrase: ABOUT, replace: true }, d.deps)).toMatchObject({ status: 'done', wordCount: 1 });
    expect(d.remote.read).toHaveBeenCalledTimes(1);
    expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(OLD[0], 1), encodeRevokeGuardian(P1, NEW[0], 1)]);
  });

  it('words set up elsewhere without a readable wvk (no-wvk marker): refused in German, no op', async () => {
    const d = await setup({ state: { guardians: [P1, NEW[0]], threshold: 1 }, server: { wvk: WORDS_NO_WVK_BLOB }, token: true });
    expect(await enableRecoveryWords({ safe: SAFE, phrase: ABOUT, replace: true }, d.deps)).toEqual({ status: 'error', message: WORDS_ELSEWHERE_MESSAGE });
    expect(await disableRecoveryWords({ safe: SAFE }, d.deps)).toEqual({ status: 'error', message: WORDS_ELSEWHERE_MESSAGE });
    expect(d.sendOp).not.toHaveBeenCalled();
  });

  it('currentWordsPool: valid local pool / none (no guardians, token read without wvk, confirmed people) / unknown', async () => {
    const pool = { addresses: NEW, confirmedAt: 1 };
    const a = await setup({ state: { guardians: [], threshold: 0 }, pool });
    expect(await currentWordsPool([NEW[0], P1], a.deps)).toEqual({ pool, state: 'local' });
    expect(await currentWordsPool([], a.deps)).toEqual({ pool: null, state: 'none' });
    expect(await currentWordsPool([P1], a.deps)).toEqual({ pool: null, state: 'unknown' });
    const tokenNone = await setup({ state: { guardians: [], threshold: 0 }, token: true, server: { wvk: WORDS_OFF_BLOB } });
    expect(await currentWordsPool([P1], tokenNone.deps)).toEqual({ pool: null, state: 'none' });
    const tokenReal = await setup({ state: { guardians: [], threshold: 0 }, token: true, server: { wvk: await wrapVaultKey(PRF, wordsVaultKey(JUNK), wrapSecret, NEW) } });
    expect(await currentWordsPool([P1, NEW[0]], tokenReal.deps)).toEqual({ pool: null, state: 'unknown' });
    expect(tokenReal.getPrf).not.toHaveBeenCalled();
    const noWvk = await setup({ state: { guardians: [], threshold: 0 }, token: true, server: { wvk: WORDS_NO_WVK_BLOB } });
    expect((await currentWordsPool([P1], noWvk.deps)).state).toBe('unknown');
  });

  it('after "Wörter entfernen" the remaining people need no prompt to be known as people', async () => {
    const d = await setup({ state: { guardians: [P1, NEW[0]], threshold: 1 }, pool: { addresses: NEW, confirmedAt: 1 }, vaultKey: wordsVaultKey(JUNK) });
    expect((await disableRecoveryWords({ safe: SAFE }, d.deps)).status).toBe('done');
    expect(await currentWordsPool([P1], d.deps)).toEqual({ pool: null, state: 'none' });
    // a guardian added later by someone else is not covered
    expect((await currentWordsPool([P1, P2], d.deps)).state).toBe('unknown');
  });

  it('syncWordsPool: one signed read learns the pool and the vault key; the guardian list then knows the words', async () => {
    const wvk = await wrapVaultKey(PRF, wordsVaultKey(JUNK), wrapSecret, NEW);
    const d = await setup({ state: { guardians: [P1, NEW[0]], threshold: 1 }, server: { wvk }, readPrf: PRF });
    expect(await syncWordsPool(SAFE, d.deps)).toEqual({ status: 'done', on: true });
    expect(d.getPrf).not.toHaveBeenCalled();
    expect((await loadWordsPool(d.storage))!.addresses).toEqual(NEW);
    expect(await loadVaultKey(d.vaultStorage)).toBe(wordsVaultKey(JUNK));
    expect((await currentWordsPool([P1, NEW[0]], d.deps)).state).toBe('local');
  });

  it('syncWordsPool: words off on the server → the guardians are confirmed people; no-wvk → German refusal', async () => {
    const off = await setup({ state: { guardians: [P1], threshold: 1 }, server: { wvk: WORDS_OFF_BLOB }, token: true });
    expect(await syncWordsPool(SAFE, off.deps)).toEqual({ status: 'done', on: false });
    expect(await currentWordsPool([P1], off.deps)).toEqual({ pool: null, state: 'none' });
    const nowvk = await setup({ state: { guardians: [P1], threshold: 1 }, server: { wvk: WORDS_NO_WVK_BLOB }, token: true });
    expect(await syncWordsPool(SAFE, nowvk.deps)).toEqual({ status: 'error', message: WORDS_ELSEWHERE_MESSAGE });
  });
});

describe('retry "on" checks the server wvk first (I1c, L4)', () => {
  const pending = async (o: Parameters<typeof deps>[0]) => {
    const d = await setup({ pool: { addresses: NEW, confirmedAt: 1 }, vaultKey: wordsVaultKey(JUNK), secrets: [{ slot: 'maci', secret: utf8Encode('m') }], ...o });
    await d.storage.setItem(WORDS_PENDING_KEY, 'on');
    return d;
  };

  it('a server wvk under ANOTHER vault key is never overwritten: local words dropped, nothing written', async () => {
    const other = await wrapVaultKey(PRF, wordsVaultKey(ABOUT), wrapSecret, OLD);
    const d = await pending({ state: { guardians: [NEW[0]], threshold: 1 }, server: { wvk: other }, readPrf: PRF });
    expect(await retryWordsBackup({ safe: SAFE }, d.deps)).toEqual({ status: 'done' });
    expect(d.written).toHaveLength(0);
    expect(d.server.wvk).toBe(other);
    expect(await loadWordsPool(d.storage)).toBeNull();
    expect(await loadWordsPending(d.storage)).toBeNull();
  });

  it('a server wvk under THIS vault key, or a marker: written (the PRF of the read is reused)', async () => {
    const mine = await wrapVaultKey(PRF, wordsVaultKey(JUNK), wrapSecret);
    const d = await pending({ state: { guardians: [NEW[0]], threshold: 1 }, server: { wvk: mine }, readPrf: PRF });
    expect(await retryWordsBackup({ safe: SAFE }, d.deps)).toEqual({ status: 'done' });
    expect(d.getPrf).not.toHaveBeenCalled();
    expect(await unwrapWordsVault(PRF, d.server.wvk!, unwrapSecret)).toEqual({ vaultKey: wordsVaultKey(JUNK), addresses: NEW });
    const marker = await pending({ state: { guardians: [NEW[0]], threshold: 1 }, server: { wvk: WORDS_NO_WVK_BLOB }, token: true });
    expect(await retryWordsBackup({ safe: SAFE }, marker.deps)).toEqual({ status: 'done' });
    expect(marker.written).toHaveLength(1);
  });

  it('retry "off" never takes the no-wvk marker for its own state (and asks no PRF for it)', async () => {
    const d = await setup({ state: { guardians: [], threshold: 1 }, server: { wvk: WORDS_NO_WVK_BLOB }, token: true });
    await d.storage.setItem(WORDS_PENDING_KEY, `off:${'ab'.repeat(32)}`);
    expect(await retryWordsBackup({ safe: SAFE }, d.deps)).toEqual({ status: 'done' });
    expect(d.written).toHaveLength(0);
    expect(d.getPrf).not.toHaveBeenCalled();
    expect(d.server.wvk).toBe(WORDS_NO_WVK_BLOB);
  });

  it('resolveVaultKey reads the no-wvk marker like off (device copy cleared, no key)', async () => {
    const d = await setup({ state: { guardians: [], threshold: 0 }, vaultKey: wordsVaultKey(JUNK) });
    expect(await resolveVaultKey({ storage: d.vaultStorage, wvkBlob: WORDS_NO_WVK_BLOB, prf: PRF, unwrap: unwrapSecret })).toBeNull();
    expect(await loadVaultKey(d.vaultStorage)).toBeNull();
  });
});
