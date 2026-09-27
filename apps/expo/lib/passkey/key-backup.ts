/**
 * Client for the passkey key backup (apps/web/src/lib/passkey/key-backup-handler.ts).
 *
 * The server keeps, per identity, the PRF-wrapped ciphertext of the secrets that used to be
 * derived from a deterministic thirdweb signature (MACI voting key, Nostr key, commitment salt).
 * Without this, a NEW device on a passkey session could not get them back: passkey signatures are
 * randomized and the local vault blobs (`passkey_wrapped_*_v1`) are SecureStore-only.
 *
 * Every request carries a signature by the identity over a fixed text (byte-exact with the
 * server, pinned by __tests__/key-backup-vector.json). The signer also returns the PRF output of
 * the same assertion, so reading and unwrapping costs one fingerprint.
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, type Address, type Hex } from 'viem';
import { utf8Encode } from './encoding';

export const KEY_BACKUP_SLOTS = ['maci', 'nostr', 'salt'] as const;
export type KeyBackupSlot = (typeof KEY_BACKUP_SLOTS)[number];
export type KeyBackupBlobs = Partial<Record<KeyBackupSlot, string>>;

export const KEY_BACKUP_UNAVAILABLE_MESSAGE =
  'Die Schlüssel-Sicherung ist gerade nicht erreichbar. Bitte prüfe deine Verbindung und versuche es erneut.';

/** `slot=blob` lines in slot order, then `replace=0|1` (same as the server). */
export function keyBackupContent(blobs: KeyBackupBlobs, replace: boolean): string {
  const lines = KEY_BACKUP_SLOTS.filter((s) => blobs[s] !== undefined).map((s) => `${s}=${blobs[s]}`);
  lines.push(`replace=${replace ? 1 : 0}`);
  return lines.join('\n');
}

export function keyBackupContentHash(blobs: KeyBackupBlobs, replace: boolean): string {
  return bytesToHex(sha256(utf8Encode(keyBackupContent(blobs, replace)))).slice(2);
}

export function buildKeyBackupProofMessage(
  p:
    | { action: 'read'; identity: Address; timestamp: number }
    | { action: 'write'; identity: Address; timestamp: number; contentHash: string },
): string {
  const lines = [
    'Röbel: Schlüssel-Sicherung',
    p.action === 'read' ? 'Aktion: lesen' : 'Aktion: speichern',
    `Konto: ${p.identity.toLowerCase()}`,
  ];
  if (p.action === 'write') lines.push(`Inhalt: ${p.contentHash}`);
  lines.push(`Zeit: ${p.timestamp}`);
  lines.push('Nur verschlüsselte Daten. Entsperren kann nur dein Passkey.');
  return lines.join('\n');
}

/** Signs an EIP-191 text as the identity; `prf` = the PRF output of the same passkey assertion. */
export type BackupSigner = (message: string) => Promise<{ signature: Hex; prf?: Hex }>;

export type RemoteRead =
  | { status: 'found'; blobs: KeyBackupBlobs; prf?: Hex }
  | { status: 'none'; prf?: Hex }
  | { status: 'disabled' };

export type RemoteWrite = 'stored' | 'exists' | 'disabled';

export type RemoteBackup = {
  read: () => Promise<RemoteRead>;
  write: (blobs: KeyBackupBlobs, replace?: boolean) => Promise<RemoteWrite>;
};

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type KeyBackupClientDeps = {
  /** The passkey API base (EXPO_PUBLIC_PASSKEY_API_URL); empty = backup not configured ("disabled"). */
  apiUrl: string;
  identity: Address;
  sign: BackupSigner;
  fetch?: FetchLike;
  nowSec?: () => number;
  timeoutMs?: number;
};

async function post(d: KeyBackupClientDeps, path: string, body: unknown) {
  const fetchImpl = d.fetch ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), d.timeoutMs ?? 20_000);
  try {
    const res = await fetchImpl(`${d.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json };
  } catch {
    throw new Error(KEY_BACKUP_UNAVAILABLE_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}

const isDisabled = (r: { status: number; json: any }) => r.status === 503 && r.json?.error === 'disabled';

/** Transport errors and unexpected answers THROW (German): callers must never treat them as "no backup". */
export function createKeyBackupClient(d: KeyBackupClientDeps): RemoteBackup {
  const now = () => (d.nowSec ?? (() => Math.floor(Date.now() / 1000)))();
  return {
    async read() {
      if (!d.apiUrl) return { status: 'disabled' };
      const timestamp = now();
      const { signature, prf } = await d.sign(buildKeyBackupProofMessage({ action: 'read', identity: d.identity, timestamp }));
      const r = await post(d, '/api/passkey/key-backup/get', { identity: d.identity, proof: { timestamp, signature } });
      if (isDisabled(r)) return { status: 'disabled' };
      if (!r.ok || !r.json || typeof r.json.blobs !== 'object' || r.json.blobs === null) {
        throw new Error(KEY_BACKUP_UNAVAILABLE_MESSAGE);
      }
      const blobs: KeyBackupBlobs = {};
      for (const s of KEY_BACKUP_SLOTS) if (typeof r.json.blobs[s] === 'string') blobs[s] = r.json.blobs[s];
      const withPrf = prf ? { prf } : {};
      return Object.keys(blobs).length > 0 ? { status: 'found', blobs, ...withPrf } : { status: 'none', ...withPrf };
    },
    async write(blobs, replace = false) {
      if (!d.apiUrl) return 'disabled';
      const timestamp = now();
      const contentHash = keyBackupContentHash(blobs, replace);
      const { signature } = await d.sign(
        buildKeyBackupProofMessage({ action: 'write', identity: d.identity, timestamp, contentHash }),
      );
      const r = await post(d, '/api/passkey/key-backup/put', {
        identity: d.identity,
        blobs,
        ...(replace ? { replace: true } : {}),
        proof: { timestamp, signature },
      });
      if (isDisabled(r)) return 'disabled';
      if (r.status === 409 && r.json?.error === 'exists') return 'exists';
      if (!r.ok) throw new Error(KEY_BACKUP_UNAVAILABLE_MESSAGE);
      return 'stored';
    },
  };
}
