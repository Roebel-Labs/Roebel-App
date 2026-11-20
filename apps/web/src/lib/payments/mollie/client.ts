import { PaymentProviderError } from "../types";

// Thin Mollie REST client on plain fetch (no SDK dependency: we use five endpoints and the OAuth
// token endpoint, and the official client would add a bundle for little gain).

export const MOLLIE_API = "https://api.mollie.com/v2";
export const MOLLIE_TOKEN_URL = "https://api.mollie.com/oauth2/tokens";
export const MOLLIE_AUTHORIZE_URL = "https://my.mollie.com/oauth2/authorize";

/**
 * Requested once, on day one: adding scopes later forces every merchant to re-authorize (spec §2.1).
 * MOLLIE_OAUTH_SCOPES overrides the list if Mollie rejects one for our app type.
 */
export const MOLLIE_SCOPES = [
  "payments.read", "payments.write", "refunds.read", "refunds.write",
  "onboarding.read", "onboarding.write", "profiles.read", "profiles.write",
  "organizations.read", "clients.write", "payment-links.read", "payment-links.write",
  "customers.read", "customers.write", "mandates.read", "mandates.write",
  "subscriptions.read", "subscriptions.write", "terminals.read", "terminals.write",
  "balances.read", "settlements.read", "invoices.read",
];

export function mollieScopes(): string {
  return (process.env.MOLLIE_OAUTH_SCOPES ?? MOLLIE_SCOPES.join(" ")).trim();
}

export function webBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "https://www.roebel.app").replace(/\/$/, "");
}

export function mollieRedirectUri(): string {
  return `${webBaseUrl()}/api/payments/mollie/callback`;
}

/**
 * Live vs test is a per-request flag on OAuth calls (`testmode`), not a property of the token.
 * MOLLIE_LIVE=true flips the platform to live payments; anything else stays in test mode.
 */
export function isMollieLivemode(): boolean {
  return process.env.MOLLIE_LIVE === "true";
}

export function isMollieConfigured(): boolean {
  return !!process.env.MOLLIE_CLIENT_ID && !!process.env.MOLLIE_CLIENT_SECRET;
}

export function eurosString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function centsFromAmount(amount: { value?: string } | null | undefined): number {
  const n = Number(amount?.value ?? "0");
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export type MollieTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<MollieTokenResponse> {
  const id = process.env.MOLLIE_CLIENT_ID ?? "";
  const secret = process.env.MOLLIE_CLIENT_SECRET ?? "";
  const res = await fetch(MOLLIE_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    const msg = typeof json.error_description === "string" ? json.error_description : typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
    throw new PaymentProviderError(502, "MOLLIE_OAUTH", `Mollie OAuth: ${msg}`);
  }
  return json as unknown as MollieTokenResponse;
}

export function exchangeAuthorizationCode(code: string): Promise<MollieTokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: mollieRedirectUri() });
}

export function refreshAccessToken(refreshToken: string): Promise<MollieTokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Authenticated Mollie API call. `token` is an org OAuth access token, an advanced access token or an API key. */
export async function mollieFetch<T = Record<string, unknown>>(
  token: string, path: string, init?: { method?: string; body?: unknown; query?: Record<string, string | undefined> },
): Promise<T> {
  const url = new URL(`${MOLLIE_API}${path}`);
  for (const [k, v] of Object.entries(init?.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (res.status === 204) return {} as T;
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof json.detail === "string" ? json.detail : `HTTP ${res.status}`;
    throw new PaymentProviderError(res.status === 404 ? 404 : 502, "MOLLIE_ERROR", `Mollie: ${detail}`);
  }
  return json as T;
}
