/**
 * Storage for the optional passkey warning email. Server-only.
 *
 * The production implementation (email-store-supabase.ts) writes ONLY the passkey_* tables from
 * supabase/migrations/20260927_passkey_contact_email.sql. It never touches `users.email`, so the
 * newsletter auto-enroll trigger on `users` can never fire for these addresses.
 *
 * `InMemoryEmailStore` is for tests and the preview (per serverless instance, lost on cold start).
 */
export type EmailChallenge = {
  safe: string; // lowercase
  email: string; // normalized
  codeHash: string; // hex sha256, never the code
  expiresAt: number; // unix seconds
  attempts: number;
};

export type EmailContact = {
  safe: string; // lowercase
  email: string;
  emailVerifiedAt: number | null; // unix seconds
  alertsEnabled: boolean;
};

export interface PasskeyEmailStore {
  getChallenge(safe: string): Promise<EmailChallenge | null>;
  /** Replaces any open challenge for this Safe. */
  putChallenge(c: EmailChallenge): Promise<void>;
  setChallengeAttempts(safe: string, attempts: number): Promise<void>;
  deleteChallenge(safe: string): Promise<void>;

  getContact(safe: string): Promise<EmailContact | null>;
  /** Sets the verified email (replacing an older one) with alerts on. */
  saveVerifiedContact(safe: string, email: string, verifiedAt: number): Promise<void>;
  deleteContact(safe: string): Promise<void>;

  /** Records a used proof; false when it was already used (replay). `expiresAt` = unix seconds. */
  consumeProof(proofHash: string, expiresAt: number): Promise<boolean>;

  /** Recovery-alert scan cursor: the last fully processed block. */
  getCursor(id: string): Promise<bigint | null>;
  setCursor(id: string, block: bigint): Promise<void>;
  /** Claims the alert for (wallet, nonce); false when it was already claimed (sent). */
  claimAlert(wallet: string, nonce: bigint, executeAfter: bigint): Promise<boolean>;
  /** Releases a claim whose email could not be sent, so the next run retries it. */
  releaseAlert(wallet: string, nonce: bigint): Promise<void>;
}

export class InMemoryEmailStore implements PasskeyEmailStore {
  readonly challenges = new Map<string, EmailChallenge>();
  readonly contacts = new Map<string, EmailContact>();
  readonly proofs = new Map<string, number>();
  readonly cursors = new Map<string, bigint>();
  readonly alerts = new Set<string>();

  constructor(private readonly nowSec: () => number = () => Math.floor(Date.now() / 1000)) {}

  async getChallenge(safe: string) {
    return this.challenges.get(safe.toLowerCase()) ?? null;
  }
  async putChallenge(c: EmailChallenge) {
    this.challenges.set(c.safe.toLowerCase(), { ...c, safe: c.safe.toLowerCase() });
  }
  async setChallengeAttempts(safe: string, attempts: number) {
    const c = this.challenges.get(safe.toLowerCase());
    if (c) c.attempts = attempts;
  }
  async deleteChallenge(safe: string) {
    this.challenges.delete(safe.toLowerCase());
  }
  async getContact(safe: string) {
    return this.contacts.get(safe.toLowerCase()) ?? null;
  }
  async saveVerifiedContact(safe: string, email: string, verifiedAt: number) {
    const key = safe.toLowerCase();
    this.contacts.set(key, { safe: key, email, emailVerifiedAt: verifiedAt, alertsEnabled: true });
  }
  async deleteContact(safe: string) {
    this.contacts.delete(safe.toLowerCase());
  }
  async consumeProof(proofHash: string, expiresAt: number) {
    const now = this.nowSec();
    for (const [k, exp] of this.proofs) if (exp < now) this.proofs.delete(k);
    if (this.proofs.has(proofHash)) return false;
    this.proofs.set(proofHash, expiresAt);
    return true;
  }
  async getCursor(id: string) {
    return this.cursors.get(id) ?? null;
  }
  async setCursor(id: string, block: bigint) {
    this.cursors.set(id, block);
  }
  async claimAlert(wallet: string, nonce: bigint) {
    const key = `${wallet.toLowerCase()}:${nonce}`;
    if (this.alerts.has(key)) return false;
    this.alerts.add(key);
    return true;
  }
  async releaseAlert(wallet: string, nonce: bigint) {
    this.alerts.delete(`${wallet.toLowerCase()}:${nonce}`);
  }
}

/** Store failure (the route answers 503). The message never carries user data. */
export class EmailStoreError extends Error {
  constructor(op: string) {
    super(`passkey email store: ${op} failed`);
    this.name = "EmailStoreError";
  }
}
