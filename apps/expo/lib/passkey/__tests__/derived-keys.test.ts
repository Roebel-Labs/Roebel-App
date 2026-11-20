/** Runtime wiring under a 12-word (ecdsa) session: see the "expert account" describe at the end. */
const mockStore = new Map<string, string>();
const mockPhrase = { read: jest.fn(async (_reason: string) => '') };
jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../phrase-store-runtime', () => ({ phraseStore: mockPhrase }));
jest.mock('../api-session-runtime', () => ({
  passkeyApiSession: { peek: async () => null, get: async () => null, invalidate: async () => undefined },
}));
jest.mock('../recovery-lookup', () => ({ ...jest.requireActual('../recovery-lookup'), findLinkedLegacies: async () => [] }));
jest.mock('../userop', () => ({ ...jest.requireActual('../userop'), isSafeDeployed: async () => true }));
jest.mock('../webauthn', () => ({
  ...jest.requireActual('../webauthn'),
  signWithPasskey: jest.fn(async () => {
    throw new Error('the passkey must never be asked for a words session');
  }),
  getPrfSecret: jest.fn(async () => {
    throw new Error('the passkey PRF must never be asked for a words session');
  }),
}));

import { getAddress, type Hex } from 'viem';
import {
  backupDeviceSecrets,
  BACKUP_RACE_MESSAGE,
  KeyBackupNeededError,
  NO_PRF_MESSAGE,
  resolvePasskeySecret,
  SLOT_DEVICE_BLOB,
  SLOT_LABEL,
  UNWRAP_FAILED_MESSAGE,
  type ResolveDeps,
} from '../derived-keys';
import { createKeyBackupClient, type KeyBackupBlobs, type RemoteBackup, type RemoteRead } from '../key-backup';
import { MACI_WRAP_LABEL, NOSTR_WRAP_LABEL, WRAPPED_MACI_KEY, WRAPPED_NOSTR_KEY } from '../migration';
import { unwrapSecret, wrapSecret } from '../prf-vault';

const PRF = `0x${'42'.repeat(32)}` as Hex;
const OTHER_PRF = `0x${'43'.repeat(32)}` as Hex;
const VAULT = `0x${'a1'.repeat(32)}` as Hex;
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

function fakeRemote(
  initial: KeyBackupBlobs = {},
  opts: {
    disabled?: boolean;
    failRead?: boolean;
    prf?: Hex;
    writeResult?: 'stored' | 'exists';
    existsIf?: (b: KeyBackupBlobs, replace?: boolean) => boolean;
    /** No cached API-session token: `writeWithoutPrompt` answers null (default: a token is cached). */
    noToken?: boolean;
  } = {},
) {
  const blobs: KeyBackupBlobs = { ...initial };
  const writes: KeyBackupBlobs[] = [];
  const replaces: (boolean | undefined)[] = [];
  const remote: RemoteBackup = {
    read: jest.fn(async (): Promise<RemoteRead> => {
      if (opts.failRead) throw new Error('Die Schlüssel-Sicherung ist gerade nicht erreichbar.');
      if (opts.disabled) return { status: 'disabled' };
      const p = opts.prf ? { prf: opts.prf } : {};
      return Object.keys(blobs).length ? { status: 'found', blobs: { ...blobs }, ...p } : { status: 'none', ...p };
    }),
    write: jest.fn(async (b: KeyBackupBlobs, replace?: boolean) => {
      if (opts.disabled) return 'disabled' as const;
      writes.push(b);
      replaces.push(replace);
      if (opts.writeResult === 'exists' || opts.existsIf?.(b, replace)) return 'exists' as const;
      Object.assign(blobs, b);
      return 'stored' as const;
    }),
  };
  remote.writeWithoutPrompt = jest.fn(async (b: KeyBackupBlobs) => (opts.noToken ? null : remote.write(b)));
  return { remote, blobs, writes, replaces };
}

function deps(over: Partial<ResolveDeps> = {}) {
  const store = new Map<string, string>();
  let local: Uint8Array | null = null;
  const saved: Uint8Array[] = [];
  const d: ResolveDeps = {
    slot: 'maci',
    loadLocal: async () => local,
    saveLocal: async (s) => {
      local = s;
      saved.push(s);
    },
    storage: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => void store.set(k, v) },
    getPrf: jest.fn(async () => PRF),
    hasLegacyHistory: jest.fn(async () => true),
    generate: jest.fn(() => bytes('{"privKey":"random"}')),
    wrap: wrapSecret,
    unwrap: unwrapSecret,
    ...over,
  };
  return { d, store, saved, setLocal: (b: Uint8Array | null) => (local = b) };
}

describe('labels stay compatible with the migration blobs', () => {
  it('reuses the migration labels and SecureStore keys for MACI / Nostr', () => {
    expect(SLOT_LABEL.maci).toBe(MACI_WRAP_LABEL);
    expect(SLOT_LABEL.nostr).toBe(NOSTR_WRAP_LABEL);
    expect(SLOT_DEVICE_BLOB.maci).toBe(WRAPPED_MACI_KEY);
    expect(SLOT_DEVICE_BLOB.nostr).toBe(WRAPPED_NOSTR_KEY);
    expect(new Set(Object.values(SLOT_LABEL)).size).toBe(3);
  });
});

describe('resolvePasskeySecret', () => {
  it('(a) an existing local key is used as today: no PRF, no backup, no generate', async () => {
    const { remote } = fakeRemote();
    const t = deps({ remote });
    t.setLocal(bytes('{"privKey":"existing"}'));
    const r = await resolvePasskeySecret(t.d);
    expect(r).toEqual({ secret: bytes('{"privKey":"existing"}'), source: 'local' });
    expect(t.d.getPrf).not.toHaveBeenCalled();
    expect(remote.read).not.toHaveBeenCalled();
    expect(t.d.generate).not.toHaveBeenCalled();
  });

  it('(b) the migration device blob unwraps with one PRF and is persisted locally', async () => {
    const { remote } = fakeRemote();
    const t = deps({ remote });
    t.store.set(WRAPPED_MACI_KEY, await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('{"privKey":"migrated"}')));
    const r = await resolvePasskeySecret(t.d);
    expect(r.source).toBe('deviceBlob');
    expect(text(r.secret)).toBe('{"privKey":"migrated"}');
    expect(t.saved).toHaveLength(1);
    expect(t.d.getPrf).toHaveBeenCalledTimes(1);
    expect(remote.read).not.toHaveBeenCalled();
  });

  it("(b) a device blob that doesn't match this passkey fails loudly, never falls through to a new key", async () => {
    const t = deps({ hasLegacyHistory: jest.fn(async () => false) });
    t.store.set(WRAPPED_MACI_KEY, await wrapSecret(OTHER_PRF, MACI_WRAP_LABEL, bytes('x')));
    await expect(resolvePasskeySecret(t.d)).rejects.toThrow(UNWRAP_FAILED_MESSAGE);
    expect(t.d.generate).not.toHaveBeenCalled();
  });

  it('(b) no PRF on this authenticator → German error, no derivation', async () => {
    const t = deps({ getPrf: jest.fn(async () => null) });
    t.store.set(WRAPPED_MACI_KEY, await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('x')));
    await expect(resolvePasskeySecret(t.d)).rejects.toThrow(NO_PRF_MESSAGE);
  });

  it("(b') new device: the server backup unwraps with the PRF of the read's own assertion (one fingerprint)", async () => {
    const blob = await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('{"privKey":"backed-up"}'));
    const { remote } = fakeRemote({ maci: blob }, { prf: PRF });
    const t = deps({ remote });
    const r = await resolvePasskeySecret(t.d);
    expect(r.source).toBe('backup');
    expect(text(r.secret)).toBe('{"privKey":"backed-up"}');
    expect(t.d.getPrf).not.toHaveBeenCalled();
    expect(t.store.get(WRAPPED_MACI_KEY)).toBe(blob);
    expect(t.saved).toHaveLength(1);
  });

  it("(b') a new phone syncs the words vault (key + pool) from the read it already made: no extra prompt, no write when the copy is current", async () => {
    const blob = await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('K'));
    const { remote } = fakeRemote({ maci: blob, maci_w: await wrapSecret(VAULT, MACI_WRAP_LABEL, bytes('K')), wvk: 'pkv1:wvk-blob' });
    const wordsVaultKey = jest.fn(async () => VAULT);
    const t = deps({ remote, wordsVaultKey });
    expect((await resolvePasskeySecret(t.d)).source).toBe('backup');
    expect(wordsVaultKey).toHaveBeenCalledWith({ prf: PRF, wvkBlob: 'pkv1:wvk-blob' });
    expect(t.d.getPrf).toHaveBeenCalledTimes(1); // the unwrap's own PRF, reused
    expect(remote.write).not.toHaveBeenCalled();
    // a failing sync never fails the key
    const failing = deps({ remote: fakeRemote({ maci: blob }, { prf: PRF }).remote, wordsVaultKey: jest.fn(async () => { throw new Error('x'); }) });
    expect(text((await resolvePasskeySecret(failing.d)).secret)).toBe('K');
  });

  it("(b') I2: a restored key without a words copy gets one in a plain write (token, no prompt); a stale copy is left to \"Schlüssel sichern\"", async () => {
    const blob = await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('K'));
    const missing = fakeRemote({ maci: blob, wvk: 'pkv1:wvk-blob' }, { prf: PRF });
    const t = deps({ remote: missing.remote, wordsVaultKey: async () => VAULT });
    expect((await resolvePasskeySecret(t.d)).source).toBe('backup');
    expect(missing.writes.map((w) => Object.keys(w))).toEqual([['maci_w']]);
    expect(missing.replaces).toEqual([undefined]);
    expect(t.d.getPrf).not.toHaveBeenCalled();
    expect(text(await unwrapSecret(VAULT, SLOT_LABEL.maci, missing.writes[0].maci_w as string))).toBe('K');

    const stale = fakeRemote({ maci: blob, maci_w: `pkv1:words-off-${'0'.repeat(32)}`, wvk: 'pkv1:wvk-blob' }, { prf: PRF });
    const s = deps({ remote: stale.remote, wordsVaultKey: async () => VAULT });
    expect((await resolvePasskeySecret(s.d)).source).toBe('backup');
    expect(stale.remote.write).not.toHaveBeenCalled();
  });

  it("(b') N1: without a cached session token the words copy is NOT written (no new session = no fingerprint)", async () => {
    const blob = await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('K'));
    const noToken = fakeRemote({ maci: blob, wvk: 'pkv1:wvk-blob' }, { prf: PRF, noToken: true });
    const t = deps({ remote: noToken.remote, wordsVaultKey: async () => VAULT });
    expect((await resolvePasskeySecret(t.d)).source).toBe('backup');
    expect(noToken.remote.writeWithoutPrompt).toHaveBeenCalledTimes(1);
    expect(noToken.remote.write).not.toHaveBeenCalled();
    expect(noToken.writes).toEqual([]);
    expect(t.d.getPrf).not.toHaveBeenCalled();

    // A remote without a promptless write never gets the (b') copy either.
    const legacy = fakeRemote({ maci: blob, wvk: 'pkv1:wvk-blob' }, { prf: PRF });
    delete legacy.remote.writeWithoutPrompt;
    const syncLegacy = jest.fn(async () => VAULT);
    expect((await resolvePasskeySecret(deps({ remote: legacy.remote, wordsVaultKey: syncLegacy }).d)).source).toBe('backup');
    expect(legacy.remote.write).not.toHaveBeenCalled();
    // M-1: the words vault (key + pool) is still synced from the read; only the write is gated.
    expect(syncLegacy).toHaveBeenCalledWith({ prf: PRF, wvkBlob: 'pkv1:wvk-blob' });
  });

  it("(b') M-1: without a token the words vault (key + pool) is still synced from the read; only the write is skipped", async () => {
    const blob = await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('K'));
    const noToken = fakeRemote({ maci: blob, wvk: 'pkv1:wvk-blob' }, { prf: PRF, noToken: true });
    const sync = jest.fn(async () => VAULT);
    expect((await resolvePasskeySecret(deps({ remote: noToken.remote, wordsVaultKey: sync }).d)).source).toBe('backup');
    expect(sync).toHaveBeenCalledWith({ prf: PRF, wvkBlob: 'pkv1:wvk-blob' });
    expect(noToken.writes).toEqual([]);
  });

  it("(b') N1 with the real client: session.get would sign a new session → nothing is signed and nothing is written", async () => {
    const blob = await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('K'));
    const sign = jest.fn(async () => ({ signature: `0x${'ab'.repeat(65)}` as Hex, prf: PRF }));
    const get = jest.fn(async () => {
      await sign(); // a new API session = one signature (fingerprint)
      return { token: 'pst1.new', deviceId: 'd' };
    });
    const sent: string[] = [];
    const remote = createKeyBackupClient({
      apiUrl: 'https://api.test',
      identity: '0x1111111111111111111111111111111111111111',
      sign,
      session: { peek: async () => null, get, invalidate: async () => undefined },
      fetch: async (url) => {
        sent.push(url);
        return { ok: true, status: 200, json: async () => ({ blobs: { maci: blob, wvk: 'pkv1:wvk-blob' } }) };
      },
    });
    const t = deps({ remote, wordsVaultKey: async () => VAULT });
    expect((await resolvePasskeySecret(t.d)).source).toBe('backup');
    // The read itself signed once (no token); the words copy added nothing.
    expect(sent).toEqual(['https://api.test/api/passkey/key-backup/get']);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });

  it('(c) passkey-only: a RANDOM key, wrapped, backed up, then persisted', async () => {
    const { remote, writes } = fakeRemote({}, { prf: PRF });
    const t = deps({ remote, hasLegacyHistory: jest.fn(async () => false) });
    const r = await resolvePasskeySecret(t.d);
    expect(r).toMatchObject({ source: 'generated', backedUp: true });
    expect(writes).toHaveLength(1);
    expect(text(await unwrapSecret(PRF, MACI_WRAP_LABEL, writes[0].maci as string))).toBe('{"privKey":"random"}');
    expect(t.store.get(WRAPPED_MACI_KEY)).toBe(writes[0].maci);
    expect(t.saved).toHaveLength(1);
  });

  it('(c) words on: the _w copy rides in the SAME write as the primary (one write, no replace = no extra proof)', async () => {
    const { remote, writes, replaces } = fakeRemote({ wvk: 'pkv1:wvk-blob' }, { prf: PRF });
    const wordsVaultKey = jest.fn(async () => VAULT);
    const t = deps({ remote, hasLegacyHistory: jest.fn(async () => false), wordsVaultKey });
    const r = await resolvePasskeySecret(t.d);
    expect(r).toMatchObject({ source: 'generated', backedUp: true });
    expect(wordsVaultKey).toHaveBeenCalledWith({ prf: PRF, wvkBlob: 'pkv1:wvk-blob' });
    expect(writes).toHaveLength(1);
    expect(replaces[0]).toBeFalsy();
    expect(Object.keys(writes[0])).toEqual(['maci', 'maci_w']);
    expect(text(await unwrapSecret(VAULT, MACI_WRAP_LABEL, writes[0].maci_w as string))).toBe('{"privKey":"random"}');
  });

  it('(c) words off (no vault key) or a failing vault-key lookup → primary only, the resolve still succeeds', async () => {
    for (const wordsVaultKey of [jest.fn(async () => null), jest.fn(async () => { throw new Error('x'); })]) {
      const { remote, writes } = fakeRemote({}, { prf: PRF });
      const r = await resolvePasskeySecret(deps({ remote, hasLegacyHistory: jest.fn(async () => false), wordsVaultKey }).d);
      expect(r).toMatchObject({ source: 'generated', backedUp: true });
      expect(Object.keys(writes[0])).toEqual(['maci']);
    }
  });

  it('(c) a stale _w from earlier words: primary in the normal write, then the _w alone with replace', async () => {
    const { remote, writes, replaces, blobs } = fakeRemote({ maci_w: 'pkv1:old-words', wvk: 'pkv1:wvk-blob' }, { prf: PRF });
    const t = deps({ remote, hasLegacyHistory: jest.fn(async () => false), wordsVaultKey: async () => VAULT });
    const r = await resolvePasskeySecret(t.d);
    expect(Object.keys(writes[0])).toEqual(['maci']);
    expect(replaces[0]).toBeFalsy();
    expect(Object.keys(writes[1])).toEqual(['maci_w']);
    expect(replaces[1]).toBe(true);
    expect(await unwrapSecret(VAULT, MACI_WRAP_LABEL, blobs.maci_w as string)).toEqual(r.secret);
  });

  it('(c) a 409 caused by a _w slot that appeared after the read: primary retried alone, the _w is NEVER replaced; a primary race still throws', async () => {
    const onlyW = fakeRemote({ wvk: 'pkv1:wvk-blob' }, { prf: PRF, existsIf: (b, replace) => !replace && b.maci_w !== undefined });
    const r = await resolvePasskeySecret(deps({ remote: onlyW.remote, hasLegacyHistory: jest.fn(async () => false), wordsVaultKey: async () => VAULT }).d);
    expect(r.backedUp).toBe(true);
    expect(onlyW.writes.map((w) => Object.keys(w))).toEqual([['maci', 'maci_w'], ['maci']]);
    expect(onlyW.replaces).not.toContain(true);
    expect(onlyW.blobs.maci_w).toBeUndefined();
    const race = fakeRemote({ wvk: 'pkv1:wvk-blob' }, { prf: PRF, writeResult: 'exists' });
    const t = deps({ remote: race.remote, hasLegacyHistory: jest.fn(async () => false), wordsVaultKey: async () => VAULT });
    await expect(resolvePasskeySecret(t.d)).rejects.toThrow(BACKUP_RACE_MESSAGE);
    expect(race.replaces).not.toContain(true);
    expect(t.saved).toHaveLength(0);
  });

  it('(c) backup service off: still a random key (wrapped on the device), reported as not backed up', async () => {
    const { remote } = fakeRemote({}, { disabled: true });
    const t = deps({ remote, hasLegacyHistory: jest.fn(async () => false) });
    const r = await resolvePasskeySecret(t.d);
    expect(r).toMatchObject({ source: 'generated', backedUp: false });
    expect(remote.write).not.toHaveBeenCalled();
    expect(t.store.get(WRAPPED_MACI_KEY)).toMatch(/^pkv1:/);
  });

  it('(c) a backup written by another device meanwhile → retry error, the new key is NOT persisted', async () => {
    const { remote } = fakeRemote({}, { prf: PRF, writeResult: 'exists' });
    const t = deps({ remote, hasLegacyHistory: jest.fn(async () => false) });
    await expect(resolvePasskeySecret(t.d)).rejects.toThrow(BACKUP_RACE_MESSAGE);
    expect(t.saved).toHaveLength(0);
  });

  it('(c) is never reached when the backup service is unreachable (no second key on a network error)', async () => {
    const { remote } = fakeRemote({}, { failRead: true });
    const t = deps({ remote, hasLegacyHistory: jest.fn(async () => false) });
    await expect(resolvePasskeySecret(t.d)).rejects.toThrow(/nicht erreichbar/);
    expect(t.d.generate).not.toHaveBeenCalled();
  });

  it.each(['maci', 'nostr', 'salt'] as const)('(d) %s: migrated person on a new device with no blob → KeyBackupNeededError, no key', async (slot) => {
    const { remote } = fakeRemote({}, { prf: PRF });
    const t = deps({ slot, remote });
    const err = await resolvePasskeySecret(t.d).catch((e) => e);
    expect(err).toBeInstanceOf(KeyBackupNeededError);
    expect(err.slot).toBe(slot);
    expect(err.message).toMatch(/Schlüssel sichern/);
    expect(t.d.generate).not.toHaveBeenCalled();
    expect(t.saved).toHaveLength(0);
    expect(remote.write).not.toHaveBeenCalled();
  });

  it('(d) also when the backup exists but lacks THIS slot', async () => {
    const { remote } = fakeRemote({ nostr: await wrapSecret(PRF, NOSTR_WRAP_LABEL, bytes('n')) }, { prf: PRF });
    await expect(resolvePasskeySecret(deps({ remote }).d)).rejects.toBeInstanceOf(KeyBackupNeededError);
  });
});

describe('backupDeviceSecrets ("Schlüssel sichern")', () => {
  it('uploads the migration blob as is and wraps a slot that has none; reports missing slots', async () => {
    const { remote, writes } = fakeRemote({}, { prf: PRF });
    const t = deps({ remote });
    const maciBlob = await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('M'));
    t.store.set(WRAPPED_MACI_KEY, maciBlob);
    const report = await backupDeviceSecrets(
      [
        { slot: 'maci', loadLocal: async () => bytes('M') },
        { slot: 'salt', loadLocal: async () => bytes('123') },
        { slot: 'nostr', loadLocal: async () => null },
      ],
      t.d,
    );
    expect(report).toEqual({ saved: ['maci', 'salt'], conflicts: [], missing: ['nostr'], status: 'done', wordsCopies: { stored: [], failed: [] } });
    expect(writes[0].maci).toBe(maciBlob);
    expect(text(await unwrapSecret(PRF, SLOT_LABEL.salt, writes[0].salt as string))).toBe('123');
    expect(t.d.getPrf).not.toHaveBeenCalled(); // PRF came with the read
  });

  it('a server copy with the same secret counts as saved; a different one is a conflict and is never overwritten', async () => {
    const { remote } = fakeRemote(
      { maci: await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('M')), nostr: await wrapSecret(PRF, NOSTR_WRAP_LABEL, bytes('OTHER')) },
      { prf: PRF },
    );
    const report = await backupDeviceSecrets(
      [
        { slot: 'maci', loadLocal: async () => bytes('M') },
        { slot: 'nostr', loadLocal: async () => bytes('N') },
      ],
      deps({ remote }).d,
    );
    expect(report).toEqual({ saved: ['maci'], conflicts: ['nostr'], missing: [], status: 'done', wordsCopies: { stored: [], failed: [] } });
    expect(remote.write).not.toHaveBeenCalled();
  });

  it('a stale device blob (different secret) is re-wrapped instead of uploaded', async () => {
    const { remote, writes } = fakeRemote({}, { prf: PRF });
    const t = deps({ remote });
    t.store.set(WRAPPED_MACI_KEY, await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('OLD')));
    await backupDeviceSecrets([{ slot: 'maci', loadLocal: async () => bytes('NEW') }], t.d);
    expect(text(await unwrapSecret(PRF, MACI_WRAP_LABEL, writes[0].maci as string))).toBe('NEW');
  });

  it('every secret it uploads gets its words copy in the same write (one write, no replace)', async () => {
    const { remote, writes, replaces } = fakeRemote({ wvk: 'pkv1:wvk-blob' }, { prf: PRF });
    const wordsVaultKey = jest.fn(async () => VAULT);
    const report = await backupDeviceSecrets(
      [
        { slot: 'maci', loadLocal: async () => bytes('M') },
        { slot: 'salt', loadLocal: async () => bytes('123') },
        { slot: 'nostr', loadLocal: async () => null },
      ],
      { ...deps({ remote }).d, wordsVaultKey },
    );
    expect(report.saved).toEqual(['maci', 'salt']);
    expect(report.wordsCopies).toEqual({ stored: ['maci', 'salt'], failed: [] });
    expect(wordsVaultKey).toHaveBeenCalledTimes(1);
    expect(wordsVaultKey).toHaveBeenCalledWith({ prf: PRF, wvkBlob: 'pkv1:wvk-blob' });
    expect(writes).toHaveLength(1);
    expect(replaces[0]).toBeFalsy();
    expect(Object.keys(writes[0])).toEqual(['maci', 'salt', 'maci_w', 'salt_w']);
    expect(text(await unwrapSecret(VAULT, SLOT_LABEL.salt, writes[0].salt_w as string))).toBe('123');
  });

  it('a 409 from a _w slot written after the read → primary saved, no replace, that words copy reported as failed', async () => {
    const { remote, writes, replaces } = fakeRemote({ wvk: 'pkv1:wvk-blob' }, { prf: PRF, existsIf: (b, replace) => !replace && b.salt_w !== undefined });
    const report = await backupDeviceSecrets(
      [
        { slot: 'maci', loadLocal: async () => bytes('M') },
        { slot: 'salt', loadLocal: async () => bytes('123') },
      ],
      { ...deps({ remote }).d, wordsVaultKey: async () => VAULT },
    );
    expect(report.saved).toEqual(['maci', 'salt']);
    expect(writes.map((w) => Object.keys(w))).toEqual([['maci', 'salt', 'maci_w', 'salt_w'], ['maci', 'salt']]);
    expect(replaces).not.toContain(true);
    expect(report.wordsCopies).toEqual({ stored: [], failed: ['maci', 'salt'] });
  });

  it('a failed replace of a stale _w is reported as failed; the primary stays saved', async () => {
    const { remote } = fakeRemote({ salt_w: 'pkv1:old', wvk: 'pkv1:wvk-blob' }, { prf: PRF, existsIf: (_b, replace) => replace === true });
    const report = await backupDeviceSecrets(
      [
        { slot: 'maci', loadLocal: async () => bytes('M') },
        { slot: 'salt', loadLocal: async () => bytes('123') },
      ],
      { ...deps({ remote }).d, wordsVaultKey: async () => VAULT },
    );
    expect(report.saved).toEqual(['maci', 'salt']);
    expect(report.wordsCopies).toEqual({ stored: ['maci'], failed: ['salt'] });
  });

  it('a server copy that is already there (same secret) with a CURRENT words copy: nothing written; a conflict gets no copy', async () => {
    const { remote } = fakeRemote(
      {
        maci: await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('M')),
        maci_w: await wrapSecret(VAULT, MACI_WRAP_LABEL, bytes('M')),
        nostr: await wrapSecret(PRF, NOSTR_WRAP_LABEL, bytes('OTHER')),
      },
      { prf: PRF },
    );
    const report = await backupDeviceSecrets(
      [
        { slot: 'maci', loadLocal: async () => bytes('M') },
        { slot: 'nostr', loadLocal: async () => bytes('N') },
      ],
      { ...deps({ remote }).d, wordsVaultKey: async () => VAULT },
    );
    expect(remote.write).not.toHaveBeenCalled();
    expect(report.wordsCopies).toEqual({ stored: [], failed: [] });
  });

  it('I2: a key already in the backup but without a words copy gets one (plain write, no replace, no new prompt)', async () => {
    const { remote, writes, replaces } = fakeRemote({ maci: await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('M')), wvk: 'pkv1:wvk-blob' }, { prf: PRF });
    const t = deps({ remote });
    const report = await backupDeviceSecrets([{ slot: 'maci', loadLocal: async () => bytes('M') }], { ...t.d, wordsVaultKey: async () => VAULT });
    expect(report.saved).toEqual(['maci']);
    expect(report.wordsCopies).toEqual({ stored: ['maci'], failed: [] });
    expect(writes.map((w) => Object.keys(w))).toEqual([['maci_w']]);
    expect(replaces).toEqual([undefined]);
    expect(t.d.getPrf).not.toHaveBeenCalled();
    expect(text(await unwrapSecret(VAULT, SLOT_LABEL.maci, writes[0].maci_w as string))).toBe('M');
  });

  it('I2: a words copy under EARLIER words or a tombstone is replaced (the existing stale rule: one replace write)', async () => {
    const OLD_VAULT = `0x${'b2'.repeat(32)}` as Hex;
    const { remote, writes, replaces } = fakeRemote(
      {
        maci: await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('M')),
        maci_w: await wrapSecret(OLD_VAULT, MACI_WRAP_LABEL, bytes('M')),
        nostr: await wrapSecret(PRF, NOSTR_WRAP_LABEL, bytes('N')),
        nostr_w: `pkv1:words-off-${'0'.repeat(32)}`,
        wvk: 'pkv1:wvk-blob',
      },
      { prf: PRF },
    );
    const report = await backupDeviceSecrets(
      [
        { slot: 'maci', loadLocal: async () => bytes('M') },
        { slot: 'nostr', loadLocal: async () => bytes('N') },
      ],
      { ...deps({ remote }).d, wordsVaultKey: async () => VAULT },
    );
    expect(writes.map((w) => Object.keys(w))).toEqual([['maci_w', 'nostr_w']]);
    expect(replaces).toEqual([true]);
    expect(report.wordsCopies).toEqual({ stored: ['maci', 'nostr'], failed: [] });
    expect(text(await unwrapSecret(VAULT, SLOT_LABEL.maci, writes[0].maci_w as string))).toBe('M');
  });

  it('backup service off → status disabled, nothing signed beyond the read', async () => {
    const { remote } = fakeRemote({}, { disabled: true });
    const report = await backupDeviceSecrets([{ slot: 'maci', loadLocal: async () => bytes('M') }], deps({ remote }).d);
    expect(report.status).toBe('disabled');
    expect(remote.write).not.toHaveBeenCalled();
  });
});

describe('expert account (12 words): the key backup runs on the phrase vault key', () => {
  // Loaded after the mocks above (the runtime pulls in native wiring).
  const runtime = () => require('../derived-keys-runtime') as typeof import('../derived-keys-runtime');
  const { PASSKEY_SESSION_PROP } = require('../active') as typeof import('../active');
  const { WORDS_KEY_PLACEHOLDER } = require('../session') as typeof import('../session');
  const { wordsVaultKey } = require('../words') as typeof import('../words');
  const { wordsKeyServer } = require('../__testutils__/words-key-server') as typeof import('../__testutils__/words-key-server');
  const ev = require('./ecdsa-safe-vector.json') as { phrase: string; owner: string; safeAddress: string };
  const JUNK = ev.phrase;
  const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const SAFE = getAddress(ev.safeAddress);
  const session = {
    credentialId: '',
    x: WORDS_KEY_PLACEHOLDER,
    y: WORDS_KEY_PLACEHOLDER,
    safe: SAFE,
    identity: SAFE,
    ownerType: 'ecdsa' as const,
    owner: getAddress(ev.owner),
  };
  const account = { address: SAFE, [PASSKEY_SESSION_PROP]: session };
  const realFetch = global.fetch;

  beforeEach(() => {
    mockStore.clear();
    mockPhrase.read.mockReset().mockImplementation(async () => JUNK);
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  function localSlot() {
    let held: Uint8Array | null = null;
    return { load: async () => held, save: async (s: Uint8Array) => void (held = s), held: () => held };
  }

  it('expert account: a generated key is wrapped under the phrase vault key and opens again from the words alone', async () => {
    const server = wordsKeyServer({ safe: SAFE, owner: session.owner });
    global.fetch = server.fetch as unknown as typeof fetch;
    const local = localSlot();
    const r = await runtime().resolveSecretForAccount(account, 'nostr', local);
    expect(r.source).toBe('generated');
    expect(r.backedUp).toBe(true);
    // Every proof the server accepted was the Safe owner's (the words' key 0) ERC-1271 signature.
    expect(server.proofs).toBe(2); // read + write: the same two prompts a passkey costs
    const blob = server.blobs.nostr!;
    expect(blob).toBeDefined();
    // No `_w` copy and no `wvk`: the primary blob already IS under the words.
    expect(Object.keys(server.blobs)).toEqual(['nostr']);
    expect(await unwrapSecret(wordsVaultKey(JUNK), SLOT_LABEL.nostr, blob)).toEqual(r.secret);
    await expect(unwrapSecret(wordsVaultKey(ABOUT), SLOT_LABEL.nostr, blob)).rejects.toThrow();

    // A new phone: nothing on the device, only the words (typed in again) and the server copy.
    mockStore.clear();
    const fresh = localSlot();
    const again = await runtime().resolveSecretForAccount(account, 'nostr', fresh);
    expect(again.source).toBe('backup');
    expect(again.secret).toEqual(r.secret);
    expect(fresh.held()).toEqual(r.secret);
  });

  it('expert account: "Schlüssel sichern" wraps under the phrase vault key in one write', async () => {
    const server = wordsKeyServer({ safe: SAFE, owner: session.owner });
    global.fetch = server.fetch as unknown as typeof fetch;
    mockStore.set('roebel.maci.keypair.v1', '{"privKey":"maci"}');
    const report = await runtime().backupKeysForSession(session);
    expect(report.saved).toEqual(['maci']);
    expect(server.writes).toHaveLength(1);
    expect(text(await unwrapSecret(wordsVaultKey(JUNK), SLOT_LABEL.maci, server.blobs.maci!))).toBe('{"privKey":"maci"}');
    expect(mockPhrase.read.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
