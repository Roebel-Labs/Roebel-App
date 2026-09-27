/**
 * "Schlüssel sichern" completes MACI + Nostr (+ salt with a commitment). Case from the
 * 2026-09-27 device test: a fresh install holding only a Nostr key.
 */
import type { Hex } from 'viem';
import { completeKeyBackup, requiredKeySlots, THIRDWEB_OTHER_ACCOUNT_MESSAGE, type CompletionDeps } from '../key-completion';
import { KEY_BACKUP_UNAVAILABLE_MESSAGE, type KeyBackupBlobs, type KeyBackupSlot, type RemoteRead } from '../key-backup';
import { evaluateDetachChecklist } from '../detach';

const IDENTITY = '0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28';
const PRF = `0x${'11'.repeat(32)}` as Hex;
const enc = new TextEncoder();
const dec = new TextDecoder();
const bytes = (s: string) => enc.encode(s);

function setup(o: {
  local?: Partial<Record<KeyBackupSlot, string>>;
  server?: KeyBackupBlobs;
  readThrows?: boolean;
  commitment?: boolean;
  thirdweb?: { address: string } | null;
}) {
  const server: KeyBackupBlobs = { ...(o.server ?? {}) };
  const device: Record<string, string> = {};
  const writes: KeyBackupBlobs[] = [];
  const derive = jest.fn(async (slot: KeyBackupSlot) => bytes(`tw-${slot}`));
  const reads = jest.fn(async (): Promise<RemoteRead> => {
    if (o.readThrows) throw new Error(KEY_BACKUP_UNAVAILABLE_MESSAGE);
    return Object.keys(server).length ? { status: 'found', blobs: { ...server }, prf: PRF } : { status: 'none', prf: PRF };
  });
  const thirdweb = jest.fn(async () => (o.thirdweb === undefined || o.thirdweb === null ? null : { address: o.thirdweb.address, derive }));
  const d: CompletionDeps = {
    identity: IDENTITY,
    remote: {
      read: reads,
      write: jest.fn(async (blobs: KeyBackupBlobs) => {
        writes.push(blobs);
        Object.assign(server, blobs);
        return 'stored' as const;
      }),
    },
    sources: (['maci', 'nostr', 'salt'] as KeyBackupSlot[]).map((slot) => ({
      slot,
      loadLocal: async () => (o.local?.[slot] ? bytes(o.local[slot] as string) : null),
    })),
    storage: { getItem: async (k) => device[k] ?? null, setItem: async (k, v) => void (device[k] = v) },
    getPrf: jest.fn(async () => PRF),
    wrap: async (_p, label, secret) => `w:${label}:${dec.decode(secret)}`,
    unwrap: async (_p, label, blob) => bytes(blob.slice(`w:${label}:`.length)),
    hasCommitment: async () => !!o.commitment,
    thirdweb,
  };
  return { d, server, writes, derive, thirdweb, reads };
}

describe('requiredKeySlots', () => {
  it('maci + nostr, plus salt only with a commitment', () => {
    expect(requiredKeySlots(false)).toEqual(['maci', 'nostr']);
    expect(requiredKeySlots(true)).toEqual(['maci', 'nostr', 'salt']);
  });
});

describe('completeKeyBackup', () => {
  it('thirdweb session available: derives maci (+ salt), backs up everything in ONE write', async () => {
    const s = setup({ local: { nostr: 'nostr-key' }, thirdweb: { address: IDENTITY.toLowerCase() } });
    const r = await completeKeyBackup(s.d);
    expect(r.status).toBe('done');
    if (r.status !== 'done') return;
    expect(r.derived).toEqual(['maci', 'salt']);
    expect(s.derive.mock.calls.map((c) => c[0])).toEqual(['maci', 'salt']);
    expect(r.complete).toBe(true);
    expect(r.backedUp).toEqual(['maci', 'nostr', 'salt']);
    expect(s.writes).toHaveLength(1);
    expect(Object.keys(s.server).sort()).toEqual(['maci', 'nostr', 'salt']);
    expect(s.reads).toHaveBeenCalledTimes(1); // one fingerprint for the read, one for the write
    expect(s.d.getPrf).not.toHaveBeenCalled(); // the read's PRF output is reused
  });

  it('no thirdweb session: backs up what the device has and asks for Google/E-Mail for the rest', async () => {
    const s = setup({ local: { nostr: 'nostr-key' }, thirdweb: null });
    const r = await completeKeyBackup(s.d);
    expect(r.status).toBe('needsThirdweb');
    if (r.status !== 'needsThirdweb') return;
    expect(r.missing).toEqual(['maci']);
    expect(r.backedUp).toEqual(['nostr']);
    expect(Object.keys(s.server)).toEqual(['nostr']);
    expect(s.derive).not.toHaveBeenCalled();
  });

  it('with a commitment, a missing salt also needs the thirdweb session', async () => {
    const s = setup({ local: { nostr: 'n', maci: 'm' }, commitment: true, thirdweb: null });
    const r = await completeKeyBackup(s.d);
    expect(r.status).toBe('needsThirdweb');
    if (r.status === 'needsThirdweb') expect(r.missing).toEqual(['salt']);
  });

  it('required keys already backed up: complete; the optional salt is derived only when thirdweb is there', async () => {
    const s = setup({ server: { maci: 'w:x:m', nostr: 'w:x:n' }, thirdweb: null });
    const r = await completeKeyBackup(s.d);
    expect(r.status).toBe('done'); // no required slot missing → never "needsThirdweb"
    if (r.status !== 'done') return;
    expect(r.complete).toBe(true);
    expect(r.derived).toEqual([]);
    expect(s.writes).toHaveLength(0);
  });

  it('everything already backed up: thirdweb is never touched', async () => {
    const s = setup({ server: { maci: 'a', nostr: 'b', salt: 'c' }, thirdweb: { address: IDENTITY } });
    const r = await completeKeyBackup(s.d);
    expect(r.status === 'done' && r.complete).toBe(true);
    expect(s.thirdweb).not.toHaveBeenCalled();
    expect(s.writes).toHaveLength(0);
  });

  it('a backup-service error is an error, never "no backup" (nothing derived or written)', async () => {
    const s = setup({ local: { nostr: 'n' }, readThrows: true, thirdweb: { address: IDENTITY } });
    await expect(completeKeyBackup(s.d)).rejects.toThrow(KEY_BACKUP_UNAVAILABLE_MESSAGE);
    expect(s.thirdweb).not.toHaveBeenCalled();
    expect(s.derive).not.toHaveBeenCalled();
    expect(s.writes).toHaveLength(0);
  });

  it('a thirdweb session of ANOTHER account is refused before deriving', async () => {
    const s = setup({ local: { nostr: 'n' }, thirdweb: { address: '0x000000000000000000000000000000000000dEaD' } });
    await expect(completeKeyBackup(s.d)).rejects.toThrow(THIRDWEB_OTHER_ACCOUNT_MESSAGE);
    expect(s.derive).not.toHaveBeenCalled();
    expect(s.writes).toHaveLength(0);
  });

  it('an optional salt that fails to derive does not block maci', async () => {
    const s = setup({ local: { nostr: 'n' }, thirdweb: { address: IDENTITY } });
    s.derive.mockImplementation(async (slot: KeyBackupSlot) => {
      if (slot === 'salt') throw new Error('typed data refused');
      return bytes(`tw-${slot}`);
    });
    const r = await completeKeyBackup(s.d);
    expect(r.status === 'done' && r.complete).toBe(true);
    expect(Object.keys(s.server).sort()).toEqual(['maci', 'nostr']);
  });

  it('backup disabled → disabled', async () => {
    const s = setup({});
    await expect(completeKeyBackup({ ...s.d, remote: undefined })).resolves.toEqual({ status: 'disabled' });
  });
});

describe('checklist "Schlüssel gesichert"', () => {
  const base = {
    passkeySyncedConfirmed: true,
    guardians: { count: 2, threshold: 2 },
    xmtpLinked: true,
    noDmsConfirmed: false,
    sponsoredOpSucceeded: true,
  };
  const item = (i: Partial<Parameters<typeof evaluateDetachChecklist>[0]>) =>
    evaluateDetachChecklist({ ...base, localKeySlots: [], backupSlots: [], ...i }).items.find((x) => x.id === 'keyBackup')!;

  it('only nostr backed up (the device-test state) is NOT green, and names the missing key', () => {
    const it0 = item({ localKeySlots: ['nostr'], backupSlots: ['nostr'] });
    expect(it0.ok).toBe(false);
    expect(it0.detail).toMatch(/Abstimmungsschlüssel/);
  });
  it('maci + nostr is green without a commitment; salt required with one', () => {
    expect(item({ backupSlots: ['maci', 'nostr'] }).ok).toBe(true);
    expect(item({ backupSlots: ['maci', 'nostr'], requiredKeySlots: ['maci', 'nostr', 'salt'] }).ok).toBe(false);
    expect(item({ backupSlots: ['maci', 'nostr', 'salt'], requiredKeySlots: ['maci', 'nostr', 'salt'] }).ok).toBe(true);
  });
  it('unknown backup state is never green', () => {
    expect(item({ backupSlots: null }).ok).toBe(false);
  });
});

describe('describeCompletion', () => {
  const { describeCompletion } = require('../key-completion');
  const report = { saved: [], conflicts: [], missing: [], status: 'done' };
  it('German lines per outcome', () => {
    expect(describeCompletion({ status: 'disabled' }).tone).toBe('info');
    const needs = describeCompletion({ status: 'needsThirdweb', required: ['maci', 'nostr'], missing: ['maci'], backedUp: ['nostr'], report });
    expect(needs.text).toMatch(/Noch offen: Abstimmungsschlüssel/);
    expect(needs.text).toMatch(/Gesichert: Nostr-Schlüssel/);
    const done = describeCompletion({ status: 'done', required: ['maci', 'nostr'], backedUp: ['maci', 'nostr'], derived: ['maci'], complete: true, report });
    expect(done.tone).toBe('success');
    const conflict = describeCompletion({ status: 'done', required: ['maci'], backedUp: ['maci'], derived: [], complete: true, report: { ...report, conflicts: ['maci'] } });
    expect(conflict.tone).toBe('error');
  });
});
