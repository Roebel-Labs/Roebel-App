/**
 * Issued passkey API session tokens (ids only, never the token itself). Server-only.
 * Supabase implementation below; the in-memory one is for tests.
 *
 * Table public.passkey_api_sessions (supabase/migrations/20260927_passkey_api_sessions.sql, NOT
 * applied): RLS on, no policies, every privilege revoked from anon/authenticated, no functions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PASSKEY_SESSION_TABLE, type PasskeySessionClaims } from "./session-token-core";

export class PasskeySessionStoreError extends Error {
  constructor(op: string) {
    super(`passkey session store failed: ${op}`);
    this.name = "PasskeySessionStoreError";
  }
}

export interface PasskeySessionStore {
  /** Records a new token id. 'duplicate' = this nonce was used before (replayed start message). */
  insert(claims: PasskeySessionClaims): Promise<"ok" | "duplicate">;
  /** Issued for `identity`, not revoked, not expired. Throws on a store error. */
  isActive(jti: string, identity: string, nowSec: number): Promise<boolean>;
  /** Revokes one token of `identity` (no-op when unknown). */
  revoke(jti: string, identity: string): Promise<void>;
  /** Revokes every other active token of `identity` on `deviceId` (a new sign-in replaces them). */
  revokeDeviceExcept(identity: string, deviceId: string, keepJti: string): Promise<void>;
  /** Revokes every active token of `identity`. */
  revokeAll(identity: string): Promise<void>;
}

type Row = { jti: string; identity: string; safe: string | null; dev: string; iat: number; exp: number; revoked: boolean };

export class InMemoryPasskeySessionStore implements PasskeySessionStore {
  readonly rows = new Map<string, Row>();
  failing = false;

  private check(op: string) {
    if (this.failing) throw new PasskeySessionStoreError(op);
  }

  async insert(c: PasskeySessionClaims) {
    this.check("insert");
    if (this.rows.has(c.jti)) return "duplicate" as const;
    this.rows.set(c.jti, { jti: c.jti, identity: c.sub, safe: c.safe, dev: c.dev, iat: c.iat, exp: c.exp, revoked: false });
    return "ok" as const;
  }

  async isActive(jti: string, identity: string, nowSec: number) {
    this.check("isActive");
    const r = this.rows.get(jti);
    return !!r && r.identity === identity.toLowerCase() && !r.revoked && r.exp > nowSec;
  }

  async revoke(jti: string, identity: string) {
    this.check("revoke");
    const r = this.rows.get(jti);
    if (r && r.identity === identity.toLowerCase()) r.revoked = true;
  }

  async revokeDeviceExcept(identity: string, deviceId: string, keepJti: string) {
    this.check("revokeDeviceExcept");
    for (const r of this.rows.values()) if (r.identity === identity.toLowerCase() && r.dev === deviceId && r.jti !== keepJti) r.revoked = true;
  }

  async revokeAll(identity: string) {
    this.check("revokeAll");
    for (const r of this.rows.values()) if (r.identity === identity.toLowerCase()) r.revoked = true;
  }
}

const iso = (sec: number) => new Date(sec * 1000).toISOString();

export class SupabasePasskeySessionStore implements PasskeySessionStore {
  constructor(private readonly db: SupabaseClient) {}

  async insert(c: PasskeySessionClaims): Promise<"ok" | "duplicate"> {
    const r = await this.db.from(PASSKEY_SESSION_TABLE).insert({
      jti: c.jti,
      identity_address: c.sub,
      safe_address: c.safe,
      device_id: c.dev,
      issued_at: iso(c.iat),
      expires_at: iso(c.exp),
    });
    if (r.error) {
      if ((r.error as { code?: string }).code === "23505") return "duplicate";
      throw new PasskeySessionStoreError("insert");
    }
    return "ok";
  }

  async isActive(jti: string, identity: string, nowSec: number): Promise<boolean> {
    const r = await this.db
      .from(PASSKEY_SESSION_TABLE)
      .select("revoked_at, expires_at")
      .eq("jti", jti)
      .eq("identity_address", identity.toLowerCase())
      .maybeSingle();
    if (r.error) throw new PasskeySessionStoreError("isActive");
    const row = r.data as { revoked_at: string | null; expires_at: string } | null;
    return !!row && !row.revoked_at && Date.parse(row.expires_at) > nowSec * 1000;
  }

  private async revokeWhere(op: string, filter: (q: any) => any) {
    const q = this.db.from(PASSKEY_SESSION_TABLE).update({ revoked_at: new Date().toISOString() }).is("revoked_at", null);
    const r = await filter(q);
    if (r.error) throw new PasskeySessionStoreError(op);
  }

  revoke(jti: string, identity: string) {
    return this.revokeWhere("revoke", (q) => q.eq("jti", jti).eq("identity_address", identity.toLowerCase()));
  }

  revokeDeviceExcept(identity: string, deviceId: string, keepJti: string) {
    return this.revokeWhere("revokeDeviceExcept", (q) =>
      q.eq("identity_address", identity.toLowerCase()).eq("device_id", deviceId).neq("jti", keepJti),
    );
  }

  revokeAll(identity: string) {
    return this.revokeWhere("revokeAll", (q) => q.eq("identity_address", identity.toLowerCase()));
  }
}
