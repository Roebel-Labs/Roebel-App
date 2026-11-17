import { hexToBytes, type Hex } from 'viem';
import { resolvePasskeySecret, SLOT_LABEL, type ResolveDeps } from '../derived-keys';
import { utf8Encode } from '../encoding';
import type { KeyBackupBlobs, RemoteBackup } from '../key-backup';
import { unwrapSecret, wrapSecret } from '../prf-vault';
import {
  clearVaultKey,
  loadVaultKey,
  resolveVaultKey,
  saveVaultKey,
  wordsSlot,
  writeWordsCopies,
  WORDS_VAULT_KEY_LABEL,
  WORDS_VAULT_KEY_STORE,
  wrapVaultKey,
  type VaultKeyStorage,
} from '../words-vault';

const KEY_A = `0x${'a1'.repeat(32)}` as Hex;
const KEY_B = `0x${'b2'.repeat(32)}` as Hex;
const PRF = `0x${'42'.repeat(32)}` as Hex;
const OTHER_PRF = `0x${'43'.repeat(32)}` as Hex;

function mem(initial: Record<string, string> = {}): VaultKeyStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    deleteItem: async (k) => void map.delete(k),
  };
}

describe('words vault: second wrapped copy under the recovery words', () => {
  it('maps every primary slot to its _w slot', () => {
    expect(wordsSlot('maci')).toBe('maci_w');
    expect(wordsSlot('nostr')).toBe('nostr_w');
    expect(wordsSlot('salt')).toBe('salt_w');
  });

  it('writes one _w blob per secret, readable with the vault key and not with another', async () => {
    const written: KeyBackupBlobs[] = [];
    const remote = { read: async () => ({ status: 'none' as const }), write: async (b: KeyBackupBlobs) => (written.push(b), 'stored' as const) };
    const r = await writeWordsCopies({ vaultKey: KEY_A, secrets: [{ slot: 'maci', secret: utf8Encode('m') }, { slot: 'nostr', secret: utf8Encode('n') }], remote, wrap: wrapSecret });
    expect(r).toEqual({ stored: ['maci', 'nostr'], failed: [] });
    expect(Object.keys(written[0])).toEqual(['maci_w', 'nostr_w']);
    expect(await unwrapSecret(KEY_A, SLOT_LABEL.maci, written[0].maci_w!)).toEqual(utf8Encode('m'));
    await expect(unwrapSecret(KEY_B, SLOT_LABEL.maci, written[0].maci_w!)).rejects.toThrow();
  });

  it('a backup error is reported, never thrown', async () => {
    const remote = { read: async () => ({ status: 'none' as const }), write: async () => { throw new Error('offline'); } };
    expect(await writeWordsCopies({ vaultKey: KEY_A, secrets: [{ slot: 'salt', secret: utf8Encode('s') }], remote, wrap: wrapSecret })).toEqual({ stored: [], failed: ['salt'] });
  });

  it('exists / disabled answers count as failed; nothing to write costs no write', async () => {
    for (const answer of ['exists', 'disabled'] as const) {
      const remote: RemoteBackup = { read: async () => ({ status: 'none' }), write: async () => answer };
      expect(await writeWordsCopies({ vaultKey: KEY_A, secrets: [{ slot: 'maci', secret: utf8Encode('m') }], remote, wrap: wrapSecret })).toEqual({ stored: [], failed: ['maci'] });
    }
    const write = jest.fn();
    expect(await writeWordsCopies({ vaultKey: KEY_A, secrets: [], remote: { read: jest.fn(), write }, wrap: wrapSecret })).toEqual({ stored: [], failed: [] });
    expect(write).not.toHaveBeenCalled();
  });

  it('the wvk blob and replace ride in the SAME write (one write = one proof)', async () => {
    const calls: { b: KeyBackupBlobs; replace?: boolean }[] = [];
    const remote: RemoteBackup = { read: async () => ({ status: 'none' }), write: async (b, replace) => (calls.push({ b, replace }), 'stored') };
    const r = await writeWordsCopies({ vaultKey: KEY_A, secrets: [{ slot: 'maci', secret: utf8Encode('m') }], remote, wrap: wrapSecret, replace: true, extra: { wvk: 'pkv1:wvk' } });
    expect(r).toEqual({ stored: ['maci'], failed: [], wvk: true });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].b)).toEqual(['maci_w', 'wvk']);
    expect(calls[0].b.wvk).toBe('pkv1:wvk');
    expect(calls[0].replace).toBe(true);
  });

  it('a write carrying only wvk reports whether wvk was stored', async () => {
    const ok: RemoteBackup = { read: async () => ({ status: 'none' }), write: async () => 'stored' };
    const bad: RemoteBackup = { read: async () => ({ status: 'none' }), write: async () => { throw new Error('offline'); } };
    expect(await writeWordsCopies({ vaultKey: KEY_A, secrets: [], remote: ok, wrap: wrapSecret, replace: true, extra: { wvk: 'pkv1:wvk' } })).toEqual({ stored: [], failed: [], wvk: true });
    expect(await writeWordsCopies({ vaultKey: KEY_A, secrets: [], remote: bad, wrap: wrapSecret, replace: true, extra: { wvk: 'pkv1:wvk' } })).toEqual({ stored: [], failed: [], wvk: false });
  });

  it('a phone with only the passkey gets the vault key from the wvk blob', async () => {
    const storage = mem();
    const wvk = await wrapSecret(PRF, WORDS_VAULT_KEY_LABEL, hexToBytes(KEY_A));
    expect(await resolveVaultKey({ storage, wvkBlob: wvk, prf: PRF, unwrap: unwrapSecret })).toBe(KEY_A);
    expect(await loadVaultKey(storage)).toBe(KEY_A);
    expect(await resolveVaultKey({ storage: mem(), prf: PRF, unwrap: unwrapSecret })).toBeNull();
  });

  it("the server's wvk is the truth: a stale device key (old words) is overwritten with the server's", async () => {
    const storage = mem({ [WORDS_VAULT_KEY_STORE]: KEY_A });
    const wvk = await wrapVaultKey(PRF, KEY_B, wrapSecret);
    expect(await resolveVaultKey({ storage, wvkBlob: wvk, prf: PRF, unwrap: unwrapSecret })).toBe(KEY_B);
    expect(await loadVaultKey(storage)).toBe(KEY_B);
  });

  it('server without wvk (words switched off elsewhere) → null and the stale device key is cleared', async () => {
    const storage = mem({ [WORDS_VAULT_KEY_STORE]: KEY_A });
    expect(await resolveVaultKey({ storage, prf: PRF, unwrap: unwrapSecret })).toBeNull();
    expect(await loadVaultKey(storage)).toBeNull();
  });

  it('wvk but no PRF, or a wvk for another passkey → null; the device key alone is never trusted (and kept)', async () => {
    const wvk = await wrapVaultKey(PRF, KEY_B, wrapSecret);
    const storage = mem({ [WORDS_VAULT_KEY_STORE]: KEY_A });
    expect(await resolveVaultKey({ storage, wvkBlob: wvk, prf: null, unwrap: unwrapSecret })).toBeNull();
    expect(await resolveVaultKey({ storage, wvkBlob: wvk, prf: OTHER_PRF, unwrap: unwrapSecret })).toBeNull();
    expect(await loadVaultKey(storage)).toBe(KEY_A);
  });

  it('save / load / clear the device copy; a malformed stored value reads as none', async () => {
    const storage = mem();
    await saveVaultKey(storage, KEY_A);
    expect(storage.map.get(WORDS_VAULT_KEY_STORE)).toBe(KEY_A);
    expect(await loadVaultKey(storage)).toBe(KEY_A);
    await clearVaultKey(storage);
    expect(await loadVaultKey(storage)).toBeNull();
    expect(await loadVaultKey(mem({ [WORDS_VAULT_KEY_STORE]: 'junk' }))).toBeNull();
    await expect(saveVaultKey(storage, '0x1234' as Hex)).rejects.toThrow();
  });
});

/** A backup server in memory that keeps every write (with its replace flag). */
function fakeServer(initial: KeyBackupBlobs = {}, prf: Hex = PRF) {
  const blobs: KeyBackupBlobs = { ...initial };
  const writes: { b: KeyBackupBlobs; replace?: boolean }[] = [];
  const remote: RemoteBackup = {
    read: async () => (Object.keys(blobs).length ? { status: 'found', blobs: { ...blobs }, prf } : { status: 'none', prf }),
    write: async (b, replace) => {
      writes.push({ b, replace });
      Object.assign(blobs, b);
      return 'stored';
    },
  };
  return { remote, blobs, writes };
}

function resolveDeps(remote: RemoteBackup, over: Partial<ResolveDeps> = {}): ResolveDeps {
  const store = new Map<string, string>();
  let local: Uint8Array | null = null;
  return {
    slot: 'maci',
    loadLocal: async () => local,
    saveLocal: async (s) => void (local = s),
    storage: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => void store.set(k, v) },
    getPrf: async () => PRF,
    remote,
    hasLegacyHistory: async () => false,
    generate: () => utf8Encode('{"privKey":"fresh"}'),
    wrap: wrapSecret,
    unwrap: unwrapSecret,
    ...over,
  };
}

/** The runtime wiring of `wordsVaultKey` (derived-keys-runtime.resolveWordsVaultKey) over an in-memory device store. */
const vaultHook = (storage: VaultKeyStorage): NonNullable<ResolveDeps['wordsVaultKey']> => (ctx) =>
  resolveVaultKey({ storage, wvkBlob: ctx.wvkBlob, prf: ctx.prf, unwrap: unwrapSecret }).catch(() => null);

describe('words copy of new keys (Review Focus 3, end to end)', () => {
  it('a key created AFTER the words were set up gets its _w copy in the one primary write (no replace, no extra proof)', async () => {
    const server = fakeServer({ wvk: await wrapVaultKey(PRF, KEY_A, wrapSecret) });
    const storage = mem({ [WORDS_VAULT_KEY_STORE]: KEY_A });
    const r = await resolvePasskeySecret(resolveDeps(server.remote, { wordsVaultKey: vaultHook(storage) }));
    expect(r.source).toBe('generated');
    expect(server.writes).toHaveLength(1);
    expect(server.writes[0].replace).toBeFalsy();
    expect(Object.keys(server.writes[0].b)).toEqual(['maci', 'maci_w']);
    expect(await unwrapSecret(KEY_A, SLOT_LABEL.maci, server.blobs.maci_w!)).toEqual(r.secret);
  });

  it('a second phone with only the passkey: the vault key comes from the wvk blob, is saved, and the new key gets its _w copy', async () => {
    const server = fakeServer({ wvk: await wrapVaultKey(PRF, KEY_A, wrapSecret) });
    const storage = mem(); // nothing on this phone
    const r = await resolvePasskeySecret(resolveDeps(server.remote, { slot: 'nostr', wordsVaultKey: vaultHook(storage) }));
    expect(r.source).toBe('generated');
    expect(server.writes).toHaveLength(1);
    expect(await loadVaultKey(storage)).toBe(KEY_A);
    expect(await unwrapSecret(KEY_A, SLOT_LABEL.nostr, server.blobs.nostr_w!)).toEqual(r.secret);
  });

  it('words replaced on another phone (device K1, server wvk K2) → the copy is made under K2', async () => {
    const server = fakeServer({ wvk: await wrapVaultKey(PRF, KEY_B, wrapSecret) });
    const storage = mem({ [WORDS_VAULT_KEY_STORE]: KEY_A });
    const r = await resolvePasskeySecret(resolveDeps(server.remote, { wordsVaultKey: vaultHook(storage) }));
    expect(await unwrapSecret(KEY_B, SLOT_LABEL.maci, server.blobs.maci_w!)).toEqual(r.secret);
    await expect(unwrapSecret(KEY_A, SLOT_LABEL.maci, server.blobs.maci_w!)).rejects.toThrow();
    expect(await loadVaultKey(storage)).toBe(KEY_B);
  });

  it('words switched off elsewhere (server has no wvk) → no copy, and the device key is cleared', async () => {
    const server = fakeServer();
    const storage = mem({ [WORDS_VAULT_KEY_STORE]: KEY_A });
    await resolvePasskeySecret(resolveDeps(server.remote, { wordsVaultKey: vaultHook(storage) }));
    expect(server.writes).toHaveLength(1);
    expect(Object.keys(server.writes[0].b)).toEqual(['maci']);
    expect(await loadVaultKey(storage)).toBeNull();
  });
});
