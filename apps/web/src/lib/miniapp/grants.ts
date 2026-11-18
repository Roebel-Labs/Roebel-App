// apps/web/src/lib/miniapp/grants.ts
// What a person agreed to share with a version-2 mini app. Pure clamping plus the store
// interface; the Supabase store takes its client injected so node:test can load this file.
import type { SupabaseClient } from "@supabase/supabase-js";
import { consentKeys } from "@netizen-labs/miniapp-sdk/host";
import type { MiniAppIdentityRequest } from "@netizen-labs/miniapp-sdk";
import { deriveSubject } from "./subject";

export interface GrantRow {
  profile: boolean;
  address: boolean;
  credentials: string[];
  /** Consent keys already shown (granted or declined): `profile`, `address`, `cred:<ref>`. */
  asked: string[];
}

export const EMPTY_GRANT: GrantRow = Object.freeze({
  profile: false,
  address: false,
  credentials: [],
  asked: [],
}) as GrantRow;

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** A grant never exceeds the manifest; every granted item is also recorded as asked. */
export function clampGrant(
  identity: MiniAppIdentityRequest | undefined,
  input: { profile?: unknown; address?: unknown; credentials?: unknown; asked?: unknown },
): GrantRow {
  if (!identity) return { ...EMPTY_GRANT, credentials: [], asked: [] };
  const requested = (identity.credentials ?? []).map((c) => c.type.toLowerCase());
  const wanted = new Set(strings(input.credentials).map((s) => s.toLowerCase()));
  const credentials = requested.filter((r, i) => wanted.has(r) && requested.indexOf(r) === i);
  const profile = identity.profile === true && input.profile === true;
  const address = identity.address === true && input.address === true;

  const askedIn = new Set(strings(input.asked).map((k) => (k.startsWith("cred:") ? k.toLowerCase() : k)));
  if (profile) askedIn.add("profile");
  if (address) askedIn.add("address");
  for (const c of credentials) askedIn.add(`cred:${c}`);
  const keys = consentKeys(identity).map((k) => (k.startsWith("cred:") ? k.toLowerCase() : k));
  const asked = keys.filter((k, i) => askedIn.has(k) && keys.indexOf(k) === i);
  return { profile, address, credentials, asked };
}

export interface GrantStore {
  get(appId: string, wallet: string): Promise<GrantRow | null>;
  put(appId: string, wallet: string, g: GrantRow): Promise<void>;
  /** Derives the pseudonym and upserts the `mini_app_subjects` row. */
  subject(appId: string, wallet: string): Promise<string>;
  /** The wallet behind `subject`; with `appId`, only a subject of that app resolves. */
  walletOf(subject: string, appId?: string): Promise<string | null>;
}

/** Service-role store over `mini_app_grants` / `mini_app_subjects`. Errors throw. */
export function supabaseGrantStore(db: SupabaseClient, secret: string): GrantStore {
  return {
    async get(appId, wallet) {
      const { data, error } = await db
        .from("mini_app_grants")
        .select("profile, address, credentials, asked")
        .eq("mini_app_id", appId)
        .eq("wallet", wallet.toLowerCase())
        .maybeSingle();
      if (error) throw new Error(`mini_app_grants read failed: ${error.message}`);
      if (!data) return null;
      return {
        profile: data.profile === true,
        address: data.address === true,
        credentials: strings(data.credentials),
        asked: strings(data.asked),
      };
    },
    async put(appId, wallet, g) {
      const { error } = await db.from("mini_app_grants").upsert(
        {
          mini_app_id: appId,
          wallet: wallet.toLowerCase(),
          profile: g.profile,
          address: g.address,
          credentials: g.credentials,
          asked: g.asked,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "mini_app_id,wallet" },
      );
      if (error) throw new Error(`mini_app_grants write failed: ${error.message}`);
    },
    async subject(appId, wallet) {
      const w = wallet.toLowerCase();
      const subject = deriveSubject(secret, appId, w);
      const { error } = await db
        .from("mini_app_subjects")
        .upsert({ mini_app_id: appId, wallet: w, subject }, { onConflict: "mini_app_id,wallet", ignoreDuplicates: true });
      if (error) throw new Error(`mini_app_subjects write failed: ${error.message}`);
      return subject;
    },
    async walletOf(subject, appId) {
      let q = db.from("mini_app_subjects").select("wallet").eq("subject", subject);
      // Defence in depth: the token's app must own the pseudonym (subjects are unique anyway).
      if (appId !== undefined) q = q.eq("mini_app_id", appId);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(`mini_app_subjects read failed: ${error.message}`);
      return typeof data?.wallet === "string" ? data.wallet : null;
    },
  };
}
