/**
 * Wires the passkey API session tokens from env (PREVIEW-ONLY). Server-only.
 *
 *   PASSKEY_SESSION_TOKENS_ENABLED=1   issue AND accept tokens; anything else = off (every route
 *                                      then requires its usual per-request signature)
 *   PASSKEY_SESSION_SECRET             HMAC key, >= 32 chars. The SAME value goes into the Supabase
 *                                      edge secrets so org-membership / merchant-registry accept
 *                                      the token too.
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *                                      required (table passkey_api_sessions, migration
 *                                      20260927_passkey_api_sessions.sql). No in-memory fallback:
 *                                      revocation must hold across instances.
 *   GNOSIS_RPC_URL                     optional (signature check of the start message)
 */
import { createAdminClient } from "../supabase/admin";
import { verifyAccountSignature } from "../auth/verify-account-signature";
import { authenticateSessionHeaders, type PasskeySessionDeps } from "./session-handler";
import { SupabasePasskeySessionStore, type PasskeySessionStore } from "./session-token-store";
import type { PasskeySessionAuth } from "./session-token-core";

export const passkeySessionTokensEnabled = () => process.env.PASSKEY_SESSION_TOKENS_ENABLED === "1";

let store: PasskeySessionStore | null = null;

function sessionStore(): PasskeySessionStore | null {
  if (store) return store;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  store = new SupabasePasskeySessionStore(createAdminClient());
  return store;
}

export function passkeySessionDeps(): PasskeySessionDeps {
  const enabled = passkeySessionTokensEnabled();
  return {
    enabled,
    secret: process.env.PASSKEY_SESSION_SECRET ?? "",
    store: enabled ? sessionStore() : null,
    verify: ({ address, message, signature }) => verifyAccountSignature({ address, message, signature }),
    nowSec: () => Math.floor(Date.now() / 1000),
  };
}

type HeaderBag = { get(name: string): string | null };

/** Session-token auth for `wallet`; null = no token on the request or tokens off. */
export function authenticatePasskeyRequest(headers: HeaderBag | null | undefined, wallet: string): Promise<PasskeySessionAuth | null> {
  return authenticateSessionHeaders(headers, wallet, passkeySessionDeps());
}
