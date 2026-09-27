import type { Hex } from 'viem';
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
import type { KeyBackupBlobs, RemoteBackup, RemoteRead } from '../key-backup';
import { MACI_WRAP_LABEL, NOSTR_WRAP_LABEL, WRAPPED_MACI_KEY, WRAPPED_NOSTR_KEY } from '../migration';
import { unwrapSecret, wrapSecret } from '../prf-vault';

const PRF = `0x${'42'.repeat(32)}` as Hex;
const OTHER_PRF = `0x${'43'.repeat(32)}` as Hex;
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

function fakeRemote(initial: KeyBackupBlobs = {}, opts: { disabled?: boolean; failRead?: boolean; prf?: Hex; writeResult?: 'stored' | 'exists' } = {}) {
  const blobs: KeyBackupBlobs = { ...initial };
  const writes: KeyBackupBlobs[] = [];
  const remote: RemoteBackup = {
    read: jest.fn(async (): Promise<RemoteRead> => {
      if (opts.failRead) throw new Error('Die Schlüssel-Sicherung ist gerade nicht erreichbar.');
      if (opts.disabled) return { status: 'disabled' };
      const p = opts.prf ? { prf: opts.prf } : {};
      return Object.keys(blobs).length ? { status: 'found', blobs: { ...blobs }, ...p } : { status: 'none', ...p };
    }),
    write: jest.fn(async (b: KeyBackupBlobs) => {
      if (opts.disabled) return 'disabled' as const;
      writes.push(b);
      if (opts.writeResult === 'exists') return 'exists' as const;
      Object.assign(blobs, b);
      return 'stored' as const;
    }),
  };
  return { remote, blobs, writes };
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
    expect(report).toEqual({ saved: ['maci', 'salt'], conflicts: [], missing: ['nostr'], status: 'done' });
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
    expect(report).toEqual({ saved: ['maci'], conflicts: ['nostr'], missing: [], status: 'done' });
    expect(remote.write).not.toHaveBeenCalled();
  });

  it('a stale device blob (different secret) is re-wrapped instead of uploaded', async () => {
    const { remote, writes } = fakeRemote({}, { prf: PRF });
    const t = deps({ remote });
    t.store.set(WRAPPED_MACI_KEY, await wrapSecret(PRF, MACI_WRAP_LABEL, bytes('OLD')));
    await backupDeviceSecrets([{ slot: 'maci', loadLocal: async () => bytes('NEW') }], t.d);
    expect(text(await unwrapSecret(PRF, MACI_WRAP_LABEL, writes[0].maci as string))).toBe('NEW');
  });

  it('backup service off → status disabled, nothing signed beyond the read', async () => {
    const { remote } = fakeRemote({}, { disabled: true });
    const report = await backupDeviceSecrets([{ slot: 'maci', loadLocal: async () => bytes('M') }], deps({ remote }).d);
    expect(report.status).toBe('disabled');
    expect(remote.write).not.toHaveBeenCalled();
  });
});
