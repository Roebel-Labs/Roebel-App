/**
 * Wires the optional passkey email routes from env (PREVIEW-ONLY). Server-only.
 *
 *   PASSKEY_EMAIL_ENABLED=1        routes answer; anything else = 503 { error: 'disabled' }
 *   PASSKEY_EMAIL_STORE=supabase   use the passkey_* tables (needs migration
 *                                  20260927_passkey_contact_email.sql applied + SUPABASE env).
 *                                  Unset = in-memory (per serverless instance, lost on cold start:
 *                                  start and verify may land on different instances).
 *   RESEND_API_KEY                 sends from konto@roebel.app; unset = every send fails (502)
 *   GNOSIS_RPC_URL                 optional; default https://gnosis-rpc.publicnode.com
 *
 * Rate limits are in memory (see email-rate-limit.ts): a shared limiter is a production gate.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailRouteDeps } from "./email-handler";
import { createResendMailer, MailSendError, type Mailer } from "./email-mailer";
import { EMAIL_SENDS_PER_HOUR, FixedWindowLimiter, HOUR_MS, SAFE_SENDS_PER_HOUR } from "./email-rate-limit";
import { InMemoryEmailStore, type PasskeyEmailStore } from "./email-store";
import { SupabaseEmailStore } from "./email-store-supabase";
import { createGnosisSafeVerifier } from "./email-verifier";

export const passkeyEmailEnabled = () => process.env.PASSKEY_EMAIL_ENABLED === "1";

let store: PasskeyEmailStore | null = null;
let deps: Omit<EmailRouteDeps, "enabled"> | null = null;

export function passkeyEmailStore(): PasskeyEmailStore {
  if (store) return store;
  const wantsSupabase =
    process.env.PASSKEY_EMAIL_STORE === "supabase" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  store = wantsSupabase ? new SupabaseEmailStore(createAdminClient()) : new InMemoryEmailStore();
  return store;
}

export function passkeyMailer(): Mailer {
  const key = process.env.RESEND_API_KEY;
  if (key) return createResendMailer(key);
  console.error("[passkey-email] RESEND_API_KEY is not set; mails cannot be sent");
  return {
    async send() {
      throw new MailSendError();
    },
  };
}

export function passkeyEmailDeps(): EmailRouteDeps {
  if (!passkeyEmailEnabled()) {
    // The handlers answer 503 before touching any dependency.
    return { enabled: false } as EmailRouteDeps;
  }
  deps ??= {
    store: passkeyEmailStore(),
    verifier: createGnosisSafeVerifier(),
    mailer: passkeyMailer(),
    limits: {
      safe: new FixedWindowLimiter(SAFE_SENDS_PER_HOUR, HOUR_MS),
      email: new FixedWindowLimiter(EMAIL_SENDS_PER_HOUR, HOUR_MS),
    },
    nowSec: () => Math.floor(Date.now() / 1000),
  };
  return { enabled: true, ...deps };
}
