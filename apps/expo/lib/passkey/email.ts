/**
 * Optional warning email for a passkey Safe (PREVIEW-ONLY; the web routes are off unless
 * PASSKEY_EMAIL_ENABLED=1 on the preview deployment).
 *
 * The email is used ONLY for recovery warnings ("Jemand stellt dein Konto wieder her ...") and
 * notifications the person opts into. It is NEVER a login or a key, and it never subscribes
 * anyone to the newsletter (the server keeps it apart from users.email).
 *
 * Add / remove are authorized by the Safe itself: the passkey signs the fixed text below through
 * the Safe's ERC-1271 path (WebAuthn challenge = safeMessageHash(safe, hashMessage(text)), the
 * same recipe as guardian approvals, fork-proven in GuardianErc1271.t.sol). The server checks it
 * with viem verifyMessage on Gnosis. The Safe must be deployed (every migrated Safe is).
 *
 * A 12-word account (expert path, `ownerType: 'ecdsa'`) proves itself the same way through its
 * session signer (session-signer.ts): the words' account key, read behind ONE device unlock,
 * signs safeMessageHash(safe, hashMessage(text)) and the Safe's ECDSA owner signature is the
 * ERC-1271 proof. The passkey is never asked.
 *
 * The text is shared BYTE-EXACT with apps/web/src/lib/passkey/email-proof.ts, pinned by
 * __tests__/email-proof-vector.json in both apps. Change both or neither.
 *
 * The server has no status endpoint (it never reveals whether a Safe has an email), so this
 * device remembers what it set up in SecureStore (`EMAIL_STATE_KEY`).
 */
import { hashMessage, type Address, type Hex } from 'viem';
import { PASSKEY_API_URL, SAFE_WEBAUTHN_SHARED_SIGNER } from './constants';
import { safeMessageHash } from './guardians';
import type { SafeOwnerType } from './migration';
import { PhraseCancelledError, PhraseMismatchError, PhraseUnavailableError, type PhraseStore } from './phrase-store';
import { isWordsOwner, WORDS_KEY_PLACEHOLDER } from './session';
import { sessionSignerFor } from './session-signer';
import { safeSignatureFromAssertion } from './userop';
import { PasskeyCancelledError, signWithPasskey, type PasskeyAssertion } from './webauthn';

export const EMAIL_STATE_KEY = 'passkey_email_v1';
export const EMAIL_REQUEST_TIMEOUT_MS = 20_000;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export type EmailProofAction = 'add' | 'remove';

/** trim + lowercase, or null when it is not a plausible address (same rule as the server). */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null;
  return EMAIL_RE.test(email) ? email : null;
}

export function buildEmailProofMessage(
  p: { action: 'add'; safe: Address; email: string; timestamp: number } | { action: 'remove'; safe: Address; timestamp: number },
): string {
  const lines = [
    'Röbel: E-Mail für Warnungen',
    p.action === 'add' ? 'Aktion: hinzufügen' : 'Aktion: entfernen',
    `Konto: ${p.safe.toLowerCase()}`,
  ];
  if (p.action === 'add') lines.push(`E-Mail: ${p.email}`);
  lines.push(`Zeit: ${p.timestamp}`);
  lines.push('Keine Anmeldung. Nur für Warnungen.');
  return lines.join('\n');
}

/** The WebAuthn challenge the passkey signs for `message` (ERC-1271 through the Safe). */
export function emailProofChallenge(safe: Address, message: string): Hex {
  return safeMessageHash(safe, hashMessage(message));
}

/** The Safe that signs (from the migration record); `ownerType: 'ecdsa'` = a 12-word account. */
export type EmailSigner = { credentialId: string; safe: Address; owner?: Address; ownerType?: SafeOwnerType };

export type EmailDeps = {
  fetch?: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<any>;
  }>;
  apiUrl?: string;
  sign?: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>;
  /** The device's phrase store: required for a 12-word account (phrase-store-runtime in the app). */
  phrase?: Pick<PhraseStore, 'read'>;
  nowSec?: () => number;
  timeoutMs?: number;
};

/** Safe contract signature (one owner) over the proof text. */
export async function signEmailProof(signer: EmailSigner, message: string, deps: EmailDeps = {}): Promise<Hex> {
  const challenge = emailProofChallenge(signer.safe, message);
  if (isWordsOwner(signer)) {
    if (!signer.owner) throw new Error('a 12-word account needs its owner');
    if (!deps.phrase) throw new Error('a 12-word account needs the phrase store');
    const session = {
      credentialId: '',
      x: WORDS_KEY_PLACEHOLDER,
      y: WORDS_KEY_PLACEHOLDER,
      safe: signer.safe,
      identity: signer.safe,
      ownerType: 'ecdsa' as const,
      owner: signer.owner,
    };
    const words = sessionSignerFor(session, {
      signPasskey: () => Promise.reject(new Error('a 12-word account never asks for a passkey')),
      getPrf: async () => null,
      phrase: deps.phrase,
    });
    return (await words.signDigest(challenge)).safeSignature;
  }
  const assertion = await (deps.sign ?? signWithPasskey)(signer.credentialId, challenge);
  return safeSignatureFromAssertion(assertion, challenge, signer.owner ?? SAFE_WEBAUTHN_SHARED_SIGNER);
}

/** A German, user-facing error. `code` is the server's error code (or 'network' / 'cancelled'). */
export class PasskeyEmailError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PasskeyEmailError';
  }
}

const MESSAGES: Record<string, string> = {
  disabled: 'Diese Funktion ist gerade nicht verfügbar.',
  bad_request: 'Bitte prüfe die E-Mail-Adresse.',
  invalid_email: 'Bitte gib eine gültige E-Mail-Adresse ein.',
  invalid_code: 'Der Code stimmt nicht.',
  code_expired: 'Der Code ist abgelaufen. Fordere einen neuen an.',
  too_many_attempts: 'Zu viele falsche Versuche. Fordere einen neuen Code an.',
  rate_limited: 'Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.',
  bad_proof: 'Die Bestätigung mit deinem Passkey hat nicht geklappt. Bitte versuche es erneut.',
  proof_expired: 'Die Bestätigung ist abgelaufen. Prüfe Datum und Uhrzeit deines Geräts.',
  proof_used: 'Bitte versuche es erneut.',
  safe_not_deployed: 'Schließe zuerst die Passkey-Einrichtung ab.',
  send_failed: 'Die E-Mail konnte nicht gesendet werden. Bitte versuche es später erneut.',
  chain_unavailable: 'Der Dienst ist gerade nicht erreichbar. Bitte versuche es später erneut.',
  store_unavailable: 'Der Dienst ist gerade nicht erreichbar. Bitte versuche es später erneut.',
  network: 'Keine Verbindung. Bitte versuche es erneut.',
  cancelled: 'Abgebrochen.',
  words_unavailable: 'Deine 12 Wörter sind auf diesem Gerät nicht mehr lesbar. Bitte gib sie noch einmal ein.',
};
/** A 12-word account has no passkey: the codes whose passkey wording would be wrong for it. */
const WORDS_MESSAGES: Record<string, string> = {
  bad_proof: 'Die Bestätigung hat nicht geklappt. Bitte versuche es erneut.',
  safe_not_deployed: 'Dein Konto ist noch nicht vollständig eingerichtet. Bitte versuche es später erneut.',
};
const GENERIC = 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';

/** `owner: 'words'` = the signer is a 12-word account (neutral wording, never "Passkey"). */
export function emailErrorMessage(code: string, owner?: 'words'): string {
  return (owner === 'words' ? WORDS_MESSAGES[code] : undefined) ?? MESSAGES[code] ?? GENERIC;
}

/** RN fetch never times out on its own: every call gets an AbortController deadline. */
async function call(path: string, body: unknown, deps: EmailDeps, owner?: 'words'): Promise<any> {
  const base = deps.apiUrl ?? PASSKEY_API_URL;
  if (!base) throw new PasskeyEmailError('disabled', emailErrorMessage('disabled'));
  const f = deps.fetch ?? (fetch as unknown as NonNullable<EmailDeps['fetch']>);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? EMAIL_REQUEST_TIMEOUT_MS);
  let res: Awaited<ReturnType<NonNullable<EmailDeps['fetch']>>>;
  try {
    res = await f(`${base.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new PasskeyEmailError('network', emailErrorMessage('network'));
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code = typeof json?.error === 'string' ? json.error : `http_${res.status}`;
    throw new PasskeyEmailError(code, emailErrorMessage(code, owner));
  }
  return json;
}

async function signOrCancel(signer: EmailSigner, message: string, deps: EmailDeps): Promise<Hex> {
  try {
    return await signEmailProof(signer, message, deps);
  } catch (e) {
    if (e instanceof PasskeyCancelledError || e instanceof PhraseCancelledError) {
      throw new PasskeyEmailError('cancelled', emailErrorMessage('cancelled'));
    }
    if (e instanceof PhraseMismatchError) throw new PasskeyEmailError('words_unavailable', e.message);
    if (e instanceof PhraseUnavailableError) throw new PasskeyEmailError('words_unavailable', emailErrorMessage('words_unavailable'));
    throw e;
  }
}

const ownerOf = (signer: EmailSigner): 'words' | undefined => (isWordsOwner(signer) ? 'words' : undefined);

const nowSec = (deps: EmailDeps) => (deps.nowSec ? deps.nowSec() : Math.floor(Date.now() / 1000));

/** Signs the add-proof (passkey, or the 12 words after the device unlock) and asks the server to mail a 6-digit code. */
export async function requestEmailCode(
  signer: EmailSigner,
  rawEmail: string,
  deps: EmailDeps = {},
): Promise<{ email: string; expiresAt: number }> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new PasskeyEmailError('invalid_email', emailErrorMessage('invalid_email'));
  const timestamp = nowSec(deps);
  const signature = await signOrCancel(signer, buildEmailProofMessage({ action: 'add', safe: signer.safe, email, timestamp }), deps);
  const res = await call('/api/passkey/email/start', { safe: signer.safe, email, proof: { timestamp, signature } }, deps, ownerOf(signer));
  return { email, expiresAt: Number(res?.expiresAt) || timestamp + 600 };
}

export async function confirmEmailCode(safe: Address, rawCode: string, deps: EmailDeps = {}): Promise<void> {
  const code = rawCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) throw new PasskeyEmailError('invalid_code', 'Der Code hat 6 Ziffern.');
  await call('/api/passkey/email/verify', { safe, code }, deps);
}

export async function removeWarningEmail(signer: EmailSigner, deps: EmailDeps = {}): Promise<void> {
  const timestamp = nowSec(deps);
  const signature = await signOrCancel(signer, buildEmailProofMessage({ action: 'remove', safe: signer.safe, timestamp }), deps);
  await call('/api/passkey/email/remove', { safe: signer.safe, proof: { timestamp, signature } }, deps, ownerOf(signer));
}

// ---------------------------------------------------------------------------
// What this device set up (the server does not tell)
// ---------------------------------------------------------------------------

/** `verified` = the address alerts go to; `pending` = a code was sent and not confirmed yet. */
export type EmailState = { safe: Address; verified: string | null; pending: { email: string; expiresAt: number } | null };

export type EmailStateStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function emptyEmailState(safe: Address): EmailState {
  return { safe, verified: null, pending: null };
}

export async function loadEmailState(storage: EmailStateStorage, safe: Address): Promise<EmailState> {
  const raw = await storage.getItem(EMAIL_STATE_KEY);
  if (!raw) return emptyEmailState(safe);
  try {
    const s = JSON.parse(raw) as Partial<EmailState>;
    if (!s?.safe || s.safe.toLowerCase() !== safe.toLowerCase()) return emptyEmailState(safe);
    const verified = typeof s.verified === 'string' && s.verified ? s.verified : null;
    const pending =
      s.pending && typeof s.pending.email === 'string' && typeof s.pending.expiresAt === 'number' ? s.pending : null;
    return { safe, verified, pending };
  } catch {
    return emptyEmailState(safe);
  }
}

export async function saveEmailState(storage: EmailStateStorage, state: EmailState): Promise<void> {
  await storage.setItem(EMAIL_STATE_KEY, JSON.stringify(state));
}
