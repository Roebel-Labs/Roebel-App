/**
 * Kill switch for device sessions: app_settings.passkey_session_keys_enabled, read by the passkey
 * sponsor route (session-upgrade / session-grant / session ops; session-revoke ignores it).
 *
 * FAILS CLOSED: only the exact value 'true' (trimmed) is ON. A missing row, any other value, a
 * read error or a throw is OFF. The row is created by
 * supabase/migrations/20261121_passkey_session_keys_flag.sql (applied in Task 13, after the
 * security review); until then the feature stays off.
 *
 * Cached for `ttlMs` (default 30 s) per serverless instance so a flip reaches every instance within
 * that window; a failed read is cached only briefly (ERROR_TTL_MS) so a short outage does not keep
 * the feature off for long.
 */

export const PASSKEY_SESSION_KEYS_FLAG = "passkey_session_keys_enabled";
const ERROR_TTL_MS = 5_000;

/** The slice of a SupabaseClient the flag needs: from("app_settings").select("value").eq("key", k).maybeSingle(). */
export interface AppSettingsReader {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: { value?: unknown } | null; error: unknown }>;
      };
    };
  };
}

export function sessionKeysFlag(
  admin: AppSettingsReader,
  ttlMs = 30_000,
  now: () => number = Date.now,
): () => Promise<boolean> {
  let cached: { value: boolean; until: number } | null = null;
  return async () => {
    const t = now();
    if (cached && t < cached.until) return cached.value;
    let value = false;
    let ok = false;
    try {
      const { data, error } = await admin.from("app_settings").select("value").eq("key", PASSKEY_SESSION_KEYS_FLAG).maybeSingle();
      if (error) {
        console.error("[passkey-sponsor] app_settings passkey_session_keys_enabled read failed");
      } else {
        ok = true;
        value = typeof data?.value === "string" && data.value.trim() === "true";
      }
    } catch (err) {
      console.error("[passkey-sponsor] app_settings passkey_session_keys_enabled read threw:", err instanceof Error ? err.name : typeof err);
    }
    cached = { value, until: t + (ok ? ttlMs : ERROR_TTL_MS) };
    return value;
  };
}
