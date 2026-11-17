import { hexToBytes, type Hex } from 'viem';
import { backupDeviceSecrets, resolvePasskeySecret, SLOT_LABEL, type ResolveDeps } from '../derived-keys';
import { utf8Encode } from '../encoding';
import type { KeyBackupBlobs, RemoteBackup } from '../key-backup';
import { unwrapSecret, wrapSecret } from '../prf-vault';
import {
  clearVaultKey,
  createWordsCopier,
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
    await writeWordsCopies({ vaultKey: KEY_A, secrets: [{ slot: 'maci', secret: utf8Encode('m') }], remote, wrap: wrapSecret, replace: true, extra: { wvk: 'pkv1:wvk' } });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].b)).toEqual(['maci_w', 'wvk']);
    expect(calls[0].b.wvk).toBe('pkv1:wvk');
    expect(calls[0].replace).toBe(true);
  });

  it('a phone with only the passkey gets the vault key from the wvk blob', async () => {
    const storage = mem();
    const wvk = await wrapSecret(PRF, WORDS_VAULT_KEY_LABEL, hexToBytes(KEY_A));
    expect(await resolveVaultKey({ storage, wvkBlob: wvk, prf: PRF, unwrap: unwrapSecret })).toBe(KEY_A);
    expect(await loadVaultKey(storage)).toBe(KEY_A);
    expect(await resolveVaultKey({ storage: mem(), prf: PRF, unwrap: unwrapSecret })).toBeNull();
  });

  it('the device copy wins; a wvk blob for another passkey or no PRF yields null, never throws', async () => {
    const wvk = await wrapSecret(PRF, WORDS_VAULT_KEY_LABEL, hexToBytes(KEY_A));
    expect(await resolveVaultKey({ storage: mem({ [WORDS_VAULT_KEY_STORE]: KEY_B }), wvkBlob: wvk, prf: PRF, unwrap: unwrapSecret })).toBe(KEY_B);
    expect(await resolveVaultKey({ storage: mem(), wvkBlob: wvk, prf: OTHER_PRF, unwrap: unwrapSecret })).toBeNull();
    expect(await resolveVaultKey({ storage: mem(), wvkBlob: wvk, prf: null, unwrap: unwrapSecret })).toBeNull();
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

describe('words copier (the runtime wordsCopy hook)', () => {
  it('a key created AFTER the words were set up (vault key on the device) gets its _w copy, written with replace', async () => {
    const server = fakeServer();
    const storage = mem({ [WORDS_VAULT_KEY_STORE]: KEY_A });
    const wordsCopy = createWordsCopier({ storage, remote: () => server.remote, wrap: wrapSecret, unwrap: unwrapSecret });
    const r = await resolvePasskeySecret(resolveDeps(server.remote, { wordsCopy }));
    expect(r.source).toBe('generated');
    expect(server.writes).toHaveLength(2); // primary, then the words copy
    expect(server.writes[1].replace).toBe(true);
    expect(Object.keys(server.writes[1].b)).toEqual(['maci_w']);
    expect(await unwrapSecret(KEY_A, SLOT_LABEL.maci, server.blobs.maci_w!)).toEqual(r.secret);
  });

  it('a second phone with only the passkey: the vault key comes from the wvk blob, is saved, and the new key gets its _w copy', async () => {
    const server = fakeServer({ wvk: await wrapVaultKey(PRF, KEY_A, wrapSecret) });
    const storage = mem(); // nothing on this phone
    const wordsCopy = createWordsCopier({ storage, remote: () => server.remote, wrap: wrapSecret, unwrap: unwrapSecret });
    const r = await resolvePasskeySecret(resolveDeps(server.remote, { slot: 'nostr', wordsCopy }));
    expect(r.source).toBe('generated');
    expect(await loadVaultKey(storage)).toBe(KEY_A);
    expect(await unwrapSecret(KEY_A, SLOT_LABEL.nostr, server.blobs.nostr_w!)).toEqual(r.secret);
  });

  it('words not set up (no device key, no wvk) → no words write at all', async () => {
    const server = fakeServer();
    const wordsCopy = createWordsCopier({ storage: mem(), remote: () => server.remote, wrap: wrapSecret, unwrap: unwrapSecret });
    await resolvePasskeySecret(resolveDeps(server.remote, { wordsCopy }));
    expect(server.writes).toHaveLength(1);
    expect(server.blobs.maci_w).toBeUndefined();
  });

  it('"Schlüssel sichern" with two uploads makes ONE words write (one proof), both copies readable', async () => {
    const server = fakeServer();
    const storage = mem({ [WORDS_VAULT_KEY_STORE]: KEY_A });
    const wordsCopy = createWordsCopier({ storage, remote: () => server.remote, wrap: wrapSecret, unwrap: unwrapSecret });
    const d = resolveDeps(server.remote, { wordsCopy });
    const report = await backupDeviceSecrets(
      [
        { slot: 'maci', loadLocal: async () => utf8Encode('M') },
        { slot: 'salt', loadLocal: async () => utf8Encode('123') },
      ],
      d,
    );
    expect(report.wordsCopies).toEqual({ stored: ['maci', 'salt'], failed: [] });
    expect(server.writes).toHaveLength(2);
    expect(Object.keys(server.writes[1].b)).toEqual(['maci_w', 'salt_w']);
    expect(server.writes[1].replace).toBe(true);
    expect(await unwrapSecret(KEY_A, SLOT_LABEL.salt, server.blobs.salt_w!)).toEqual(utf8Encode('123'));
  });

  it('a failed words write rejects each call (reported as failed by the caller)', async () => {
    const remote: RemoteBackup = { read: async () => ({ status: 'none' }), write: async () => { throw new Error('offline'); } };
    const wordsCopy = createWordsCopier({ storage: mem({ [WORDS_VAULT_KEY_STORE]: KEY_A }), remote: () => remote, wrap: wrapSecret, unwrap: unwrapSecret });
    await expect(wordsCopy('maci', utf8Encode('m'), { prf: null })).rejects.toThrow();
  });
});
