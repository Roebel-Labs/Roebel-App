/**
 * Supabase (service role) implementation of PasskeyEmailStore. Server-only.
 *
 * Tables (supabase/migrations/20260927_passkey_contact_email.sql, NOT applied yet):
 *   passkey_contacts, passkey_email_challenges, passkey_email_used_proofs,
 *   passkey_recovery_alerts, passkey_alert_cursor
 * All RLS-on with no policies and no anon/authenticated grants, so only the service role reaches
 * them. This file writes nothing else: never `users`, never the newsletter tables.
 *
 * Used only when PASSKEY_EMAIL_STORE=supabase (see email-runtime.ts), so a preview whose database
 * lacks the migration keeps the in-memory store instead of failing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { EmailStoreError, type EmailChallenge, type EmailContact, type PasskeyEmailStore } from "./email-store";

export const PASSKEY_EMAIL_TABLES = {
  contacts: "passkey_contacts",
  challenges: "passkey_email_challenges",
  proofs: "passkey_email_used_proofs",
  alerts: "passkey_recovery_alerts",
  cursor: "passkey_alert_cursor",
} as const;

const T = PASSKEY_EMAIL_TABLES;
const UNIQUE_VIOLATION = "23505";

const iso = (sec: number) => new Date(sec * 1000).toISOString();
const sec = (v: string | null | undefined) => (v ? Math.floor(Date.parse(v) / 1000) : null);

type Result = { data?: unknown; error: { code?: string } | null };

function check(op: string, r: Result): void {
  if (r.error) throw new EmailStoreError(op);
}

export class SupabaseEmailStore implements PasskeyEmailStore {
  constructor(private readonly db: SupabaseClient) {}

  async getChallenge(safe: string): Promise<EmailChallenge | null> {
    const r = await this.db
      .from(T.challenges)
      .select("safe_address, email, code_hash, expires_at, attempts")
      .eq("safe_address", safe.toLowerCase())
      .maybeSingle();
    check("getChallenge", r);
    const row = r.data as { safe_address: string; email: string; code_hash: string; expires_at: string; attempts: number } | null;
    if (!row) return null;
    return { safe: row.safe_address, email: row.email, codeHash: row.code_hash, expiresAt: sec(row.expires_at) ?? 0, attempts: row.attempts };
  }

  async putChallenge(c: EmailChallenge): Promise<void> {
    const r = await this.db.from(T.challenges).upsert(
      {
        safe_address: c.safe.toLowerCase(),
        email: c.email,
        code_hash: c.codeHash,
        expires_at: iso(c.expiresAt),
        attempts: c.attempts,
        created_at: new Date().toISOString(),
      },
      { onConflict: "safe_address" },
    );
    check("putChallenge", r);
  }

  async setChallengeAttempts(safe: string, attempts: number): Promise<void> {
    const r = await this.db.from(T.challenges).update({ attempts }).eq("safe_address", safe.toLowerCase());
    check("setChallengeAttempts", r);
  }

  async deleteChallenge(safe: string): Promise<void> {
    const r = await this.db.from(T.challenges).delete().eq("safe_address", safe.toLowerCase());
    check("deleteChallenge", r);
  }

  async getContact(safe: string): Promise<EmailContact | null> {
    const r = await this.db
      .from(T.contacts)
      .select("safe_address, email, email_verified_at, alerts_enabled")
      .eq("safe_address", safe.toLowerCase())
      .maybeSingle();
    check("getContact", r);
    const row = r.data as { safe_address: string; email: string; email_verified_at: string | null; alerts_enabled: boolean } | null;
    if (!row) return null;
    return { safe: row.safe_address, email: row.email, emailVerifiedAt: sec(row.email_verified_at), alertsEnabled: row.alerts_enabled };
  }

  async saveVerifiedContact(safe: string, email: string, verifiedAt: number): Promise<void> {
    const now = new Date().toISOString();
    const r = await this.db.from(T.contacts).upsert(
      { safe_address: safe.toLowerCase(), email, email_verified_at: iso(verifiedAt), alerts_enabled: true, updated_at: now },
      { onConflict: "safe_address" },
    );
    check("saveVerifiedContact", r);
  }

  async deleteContact(safe: string): Promise<void> {
    const r = await this.db.from(T.contacts).delete().eq("safe_address", safe.toLowerCase());
    check("deleteContact", r);
  }

  async consumeProof(proofHash: string, expiresAt: number): Promise<boolean> {
    // Opportunistic cleanup; a failure here must not block the request.
    await this.db.from(T.proofs).delete().lt("expires_at", new Date().toISOString());
    const r = await this.db.from(T.proofs).insert({ proof_hash: proofHash, expires_at: iso(expiresAt) });
    if (r.error?.code === UNIQUE_VIOLATION) return false;
    check("consumeProof", r);
    return true;
  }

  async getCursor(id: string): Promise<bigint | null> {
    const r = await this.db.from(T.cursor).select("last_block").eq("id", id).maybeSingle();
    check("getCursor", r);
    const row = r.data as { last_block: number | string } | null;
    return row ? BigInt(row.last_block) : null;
  }

  async setCursor(id: string, block: bigint): Promise<void> {
    const r = await this.db
      .from(T.cursor)
      .upsert({ id, last_block: block.toString(), updated_at: new Date().toISOString() }, { onConflict: "id" });
    check("setCursor", r);
  }

  async claimAlert(wallet: string, nonce: bigint, executeAfter: bigint): Promise<boolean> {
    const r = await this.db.from(T.alerts).insert({
      wallet_address: wallet.toLowerCase(),
      recovery_nonce: nonce.toString(),
      execute_after: iso(Number(executeAfter)),
    });
    if (r.error?.code === UNIQUE_VIOLATION) return false;
    check("claimAlert", r);
    return true;
  }

  async releaseAlert(wallet: string, nonce: bigint): Promise<void> {
    const r = await this.db
      .from(T.alerts)
      .delete()
      .eq("wallet_address", wallet.toLowerCase())
      .eq("recovery_nonce", nonce.toString());
    check("releaseAlert", r);
  }
}
