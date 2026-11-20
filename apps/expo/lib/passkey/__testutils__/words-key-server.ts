/**
 * Test-only key-backup server for a 12-word (ecdsa) account: it answers /api/passkey/key-backup/*
 * like the real handler and checks every proof the way the server does for a deployed Safe —
 * the signature must be the Safe owner's ECDSA signature over
 * safeMessageHash(safe, hashMessage(proof text)). A wrong signer is a 401.
 */
import { getAddress, hashMessage, isAddressEqual, recoverAddress, type Address, type Hex } from 'viem';
import { safeMessageHash } from '../guardians';
import { buildKeyBackupProofMessage, keyBackupContentHash, type KeyBackupBlobs } from '../key-backup';

export type WordsKeyServer = {
  blobs: KeyBackupBlobs;
  writes: KeyBackupBlobs[];
  /** Number of proofs the server checked (each one cost the client a signature). */
  proofs: number;
  fetch: jest.Mock;
};

export function wordsKeyServer(p: { safe: Address; owner: Address; blobs?: KeyBackupBlobs }): WordsKeyServer {
  const s: WordsKeyServer = { blobs: { ...(p.blobs ?? {}) }, writes: [], proofs: 0, fetch: jest.fn() };
  const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const proofOk = async (message: string, signature: Hex) => {
    s.proofs += 1;
    const signer = await recoverAddress({ hash: safeMessageHash(p.safe, hashMessage(message)), signature });
    return isAddressEqual(signer, p.owner);
  };
  s.fetch.mockImplementation(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    if (getAddress(body.identity) !== getAddress(p.safe)) return reply(400, { error: 'bad_request' });
    if (url.endsWith('/api/passkey/key-backup/get')) {
      const msg = buildKeyBackupProofMessage({ action: 'read', identity: body.identity, timestamp: body.proof.timestamp });
      if (!(await proofOk(msg, body.proof.signature))) return reply(401, { error: 'bad_proof' });
      return reply(200, { blobs: s.blobs });
    }
    if (url.endsWith('/api/passkey/key-backup/put')) {
      const replace = body.replace === true;
      const contentHash = keyBackupContentHash(body.blobs, replace);
      const msg = buildKeyBackupProofMessage({ action: 'write', identity: body.identity, timestamp: body.proof.timestamp, contentHash });
      if (!(await proofOk(msg, body.proof.signature))) return reply(401, { error: 'bad_proof' });
      if (!replace && Object.keys(body.blobs).some((k) => (s.blobs as Record<string, string>)[k] !== undefined)) {
        return reply(409, { error: 'exists' });
      }
      s.writes.push(body.blobs);
      Object.assign(s.blobs, body.blobs);
      return reply(200, { ok: true });
    }
    throw new Error(`unexpected ${url}`);
  });
  return s;
}
