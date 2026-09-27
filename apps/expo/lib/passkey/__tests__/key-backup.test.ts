import { hashMessage, type Address, type Hex } from 'viem';
import {
  buildKeyBackupProofMessage,
  createKeyBackupClient,
  keyBackupContent,
  keyBackupContentHash,
  KEY_BACKUP_UNAVAILABLE_MESSAGE,
} from '../key-backup';
import v from './key-backup-vector.json';

const ID = v.identity as Address;
const SIG = `0x${'ab'.repeat(65)}` as Hex;
const PRF = `0x${'77'.repeat(32)}` as Hex;

describe('key backup proof text (byte-exact with apps/web key-backup-proof.ts)', () => {
  it('reproduces key-backup-vector.json', () => {
    expect(keyBackupContent(v.blobs, false)).toBe(v.content);
    expect(keyBackupContentHash(v.blobs, false)).toBe(v.contentHash);
    const read = buildKeyBackupProofMessage({ action: 'read', identity: ID, timestamp: v.timestamp });
    const write = buildKeyBackupProofMessage({ action: 'write', identity: ID, timestamp: v.timestamp, contentHash: v.contentHash });
    expect(read).toBe(v.readMessage);
    expect(write).toBe(v.writeMessage);
    expect(hashMessage(read)).toBe(v.readMessageHash);
    expect(hashMessage(write)).toBe(v.writeMessageHash);
  });
});

function client(respond: (url: string, body: any) => { status: number; json: any } | 'throw') {
  const calls: Array<{ url: string; body: any }> = [];
  const signed: string[] = [];
  const c = createKeyBackupClient({
    apiUrl: 'https://api.test',
    identity: ID,
    nowSec: () => v.timestamp,
    sign: async (m) => {
      signed.push(m);
      return { signature: SIG, prf: PRF };
    },
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      const r = respond(url, body);
      if (r === 'throw') throw new Error('network');
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
    },
  });
  return { c, calls, signed };
}

describe('key backup client', () => {
  it('read: found / none carry the PRF of the signing assertion', async () => {
    let t = client(() => ({ status: 200, json: { blobs: { maci: 'pkv1:x', junk: 'y' } } }));
    await expect(t.c.read()).resolves.toEqual({ status: 'found', blobs: { maci: 'pkv1:x' }, prf: PRF });
    expect(t.calls[0]).toEqual({ url: 'https://api.test/api/passkey/key-backup/get', body: { identity: ID, proof: { timestamp: v.timestamp, signature: SIG } } });
    expect(t.signed[0]).toBe(v.readMessage);
    t = client(() => ({ status: 200, json: { blobs: {} } }));
    await expect(t.c.read()).resolves.toEqual({ status: 'none', prf: PRF });
  });

  it('read: 503 disabled = disabled; any other failure THROWS (never "no backup")', async () => {
    await expect(client(() => ({ status: 503, json: { error: 'disabled' } })).c.read()).resolves.toEqual({ status: 'disabled' });
    await expect(client(() => ({ status: 503, json: { error: 'store_unavailable' } })).c.read()).rejects.toThrow(KEY_BACKUP_UNAVAILABLE_MESSAGE);
    await expect(client(() => ({ status: 401, json: { error: 'bad_proof' } })).c.read()).rejects.toThrow(KEY_BACKUP_UNAVAILABLE_MESSAGE);
    await expect(client(() => 'throw').c.read()).rejects.toThrow(KEY_BACKUP_UNAVAILABLE_MESSAGE);
  });

  it('no API url configured = disabled without signing', async () => {
    const sign = jest.fn();
    const c = createKeyBackupClient({ apiUrl: '', identity: ID, sign });
    await expect(c.read()).resolves.toEqual({ status: 'disabled' });
    await expect(c.write({ maci: 'pkv1:x' })).resolves.toBe('disabled');
    expect(sign).not.toHaveBeenCalled();
  });

  it('write: signs the content hash; 409 exists; replace only when asked', async () => {
    let t = client(() => ({ status: 200, json: { ok: true } }));
    await expect(t.c.write(v.blobs)).resolves.toBe('stored');
    expect(t.signed[0]).toBe(v.writeMessage);
    expect(t.calls[0].body).toEqual({ identity: ID, blobs: v.blobs, proof: { timestamp: v.timestamp, signature: SIG } });
    t = client(() => ({ status: 409, json: { error: 'exists', slots: ['maci'] } }));
    await expect(t.c.write(v.blobs)).resolves.toBe('exists');
    t = client(() => ({ status: 200, json: { ok: true } }));
    await t.c.write(v.blobs, true);
    expect(t.calls[0].body.replace).toBe(true);
    expect(t.signed[0]).toContain(`Inhalt: ${keyBackupContentHash(v.blobs, true)}`);
  });
});
