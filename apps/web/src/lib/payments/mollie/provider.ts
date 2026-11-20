import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, signState } from "../secrets";
import {
  PaymentProviderError, type CheckoutInput, type CheckoutResult, type OnboardingStatus, type PaymentAccountStatus,
  type PaymentProvider, type PaymentStatus,
} from "../types";
import {
  MOLLIE_AUTHORIZE_URL, centsFromAmount, eurosString, exchangeAuthorizationCode, isMollieLivemode, mollieFetch,
  mollieRedirectUri, mollieScopes, refreshAccessToken, webBaseUrl,
} from "./client";

/** OAuth state lifetime. The authorize step comes at the END of Mollie's sign-up/KYB, so it must outlive it. */
const STATE_TTL_SECONDS = 24 * 60 * 60;

export type PaymentAccountRow = {
  id: string; account_id: string; provider: string; provider_org_id: string | null; profile_id: string | null;
  livemode: boolean; charges_enabled: boolean; payouts_enabled: boolean; status: string;
};

/** The org's Mollie account row for the platform's current mode (test/live), or null. */
export async function mollieAccountRow(admin: SupabaseClient, accountId: string): Promise<PaymentAccountRow | null> {
  const { data } = await admin.from("payment_accounts").select("*")
    .eq("account_id", accountId).eq("provider", "mollie").eq("livemode", isMollieLivemode()).maybeSingle();
  return (data as PaymentAccountRow | null) ?? null;
}

// ---- access tokens: refresh on demand, cached in memory only (never persisted) ----

const tokenCache = new Map<string, { token: string; exp: number }>();

async function accessTokenFor(admin: SupabaseClient, row: PaymentAccountRow): Promise<string> {
  const hit = tokenCache.get(row.id);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const { data: secret } = await admin.from("payment_account_secrets")
    .select("refresh_token_enc").eq("payment_account_id", row.id).maybeSingle();
  if (!secret?.refresh_token_enc) throw new PaymentProviderError(409, "MOLLIE_NOT_AUTHORIZED", "Mollie-Verbindung fehlt. Bitte Zahlungen neu einrichten.");
  const t = await refreshAccessToken(decryptSecret(secret.refresh_token_enc));
  if (t.refresh_token) {
    // Mollie's refresh tokens are long-lived, but if one is ever rotated keep the new one.
    await admin.from("payment_account_secrets").update({ refresh_token_enc: encryptSecret(t.refresh_token), updated_at: new Date().toISOString() })
      .eq("payment_account_id", row.id);
  }
  tokenCache.set(row.id, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

async function requireRow(admin: SupabaseClient, accountId: string): Promise<PaymentAccountRow> {
  const row = await mollieAccountRow(admin, accountId);
  if (!row) throw new PaymentProviderError(409, "CONNECT_REQUIRED", "Der Veranstalter hat Mollie noch nicht eingerichtet.");
  return row;
}

function testmode(): true | undefined {
  return isMollieLivemode() ? undefined : true;
}

// ---- onboarding ----

export type OwnerPrefill = { givenName?: string; familyName?: string; email?: string };

/** Plain OAuth authorize URL: works for orgs that already have a Mollie account, and lets new ones sign up. */
function authorizeUrl(state: string): string {
  const u = new URL(MOLLIE_AUTHORIZE_URL);
  u.searchParams.set("client_id", process.env.MOLLIE_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", mollieRedirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("scope", mollieScopes());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("approval_prompt", "force");
  return u.toString();
}

/**
 * Onboarding URL for one org. With a platform advanced access token (MOLLIE_ORG_ACCESS_TOKEN,
 * scope clients.write — Client Links cannot be created with an API key) and enough owner data,
 * a pre-filled Client Link; otherwise the plain authorize URL. Both end at our OAuth callback.
 */
export async function buildMollieOnboardingUrl(
  admin: SupabaseClient, accountId: string, wallet: string, owner?: OwnerPrefill,
): Promise<{ url: string; kind: "client_link" | "authorize" }> {
  const state = signState(accountId, wallet, STATE_TTL_SECONDS);
  const platformToken = process.env.MOLLIE_ORG_ACCESS_TOKEN;
  const { data: org } = await admin.from("accounts").select("id, name, contact_email").eq("id", accountId).maybeSingle();
  if (!org) throw new PaymentProviderError(404, "NOT_FOUND", "Organisation nicht gefunden");
  const email = owner?.email ?? org.contact_email ?? undefined;
  if (platformToken && owner?.givenName && owner?.familyName && email) {
    try {
      const link = await mollieFetch<{ _links?: { clientLink?: { href?: string } } }>(platformToken, "/client-links", {
        method: "POST",
        body: {
          owner: { email, givenName: owner.givenName, familyName: owner.familyName, locale: "de_DE" },
          name: org.name,
          address: { country: "DE" },
        },
      });
      const href = link._links?.clientLink?.href;
      if (href) {
        const u = new URL(href);
        u.searchParams.set("client_id", process.env.MOLLIE_CLIENT_ID ?? "");
        u.searchParams.set("state", state);
        u.searchParams.set("scope", mollieScopes());
        u.searchParams.set("approval_prompt", "force");
        return { url: u.toString(), kind: "client_link" };
      }
    } catch (err) {
      // A Client Link is a convenience (pre-fill). Fall back to the plain authorize flow.
      console.error("[mollie] client link failed, falling back to authorize URL", err instanceof Error ? err.message : err);
    }
  }
  return { url: authorizeUrl(state), kind: "authorize" };
}

type MollieOnboarding = {
  status?: string; canReceivePayments?: boolean; canReceiveSettlements?: boolean;
  _links?: { dashboard?: { href?: string } };
};

function onboardingStatus(s: string | undefined): OnboardingStatus {
  return s === "needs-data" || s === "in-review" || s === "completed" ? s : "needs-data";
}

/**
 * Pick the org's website profile (payments need a profileId on OAuth calls). Uses an existing
 * non-blocked profile; otherwise tries to create one from org data. Creation needs website, email
 * and phone — when Mollie refuses, we keep null and the org finishes the profile in Mollie.
 */
async function ensureProfile(admin: SupabaseClient, token: string, accountId: string): Promise<string | null> {
  try {
    const list = await mollieFetch<{ _embedded?: { profiles?: Array<{ id: string; status?: string }> } }>(token, "/profiles", { query: { limit: "50" } });
    const usable = (list._embedded?.profiles ?? []).find((p) => p.status !== "blocked");
    if (usable) return usable.id;
    const { data: org } = await admin.from("accounts").select("name, contact_email, slug").eq("id", accountId).maybeSingle();
    if (!org?.contact_email) return null;
    const created = await mollieFetch<{ id?: string }>(token, "/profiles", {
      method: "POST",
      body: {
        name: org.name,
        website: org.slug ? `${webBaseUrl()}/org/${org.slug}` : webBaseUrl(),
        email: org.contact_email,
        phone: process.env.MOLLIE_PROFILE_FALLBACK_PHONE ?? undefined,
        description: "Eintrittskarten und Gebühren für Veranstaltungen in Röbel/Müritz",
      },
    });
    return created.id ?? null;
  } catch (err) {
    console.error("[mollie] profile lookup/creation failed", accountId, err instanceof Error ? err.message : err);
    return null;
  }
}

async function syncStatus(admin: SupabaseClient, row: PaymentAccountRow, token: string): Promise<PaymentAccountStatus> {
  const ob = await mollieFetch<MollieOnboarding>(token, "/onboarding/me");
  const profileId = row.profile_id ?? (await ensureProfile(admin, token, row.account_id));
  const canPay = !!ob.canReceivePayments && !!profileId;
  const canSettle = !!ob.canReceiveSettlements;
  const status = onboardingStatus(ob.status);
  await admin.from("payment_accounts").update({
    profile_id: profileId, charges_enabled: canPay, payouts_enabled: canSettle, status, updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  return {
    provider: "mollie", connected: true, canReceivePayments: canPay, canReceiveSettlements: canSettle,
    onboardingStatus: status, livemode: row.livemode, dashboardUrl: ob._links?.dashboard?.href ?? null,
  };
}

/**
 * OAuth callback work: exchange the code, store the encrypted refresh token, resolve the Mollie
 * organization + profile and upsert payment_accounts. The caller has verified `state` and the
 * signer's owner/admin role.
 */
export async function completeMollieOAuth(admin: SupabaseClient, accountId: string, wallet: string, code: string): Promise<PaymentAccountStatus> {
  const tokens = await exchangeAuthorizationCode(code);
  if (!tokens.refresh_token) throw new PaymentProviderError(502, "MOLLIE_OAUTH", "Mollie hat kein Refresh-Token geliefert.");
  const org = await mollieFetch<{ id?: string }>(tokens.access_token, "/organizations/me");
  const livemode = isMollieLivemode();
  const previous = await mollieAccountRow(admin, accountId);
  // A re-authorization may point at a different Mollie organization: its old profile id is then stale.
  const orgChanged = !!previous && previous.provider_org_id !== (org.id ?? null);
  const { data: upserted, error } = await admin.from("payment_accounts").upsert({
    account_id: accountId, provider: "mollie", livemode, provider_org_id: org.id ?? null,
    created_by_wallet: wallet.toLowerCase(), updated_at: new Date().toISOString(),
    ...(orgChanged ? { profile_id: null, charges_enabled: false, payouts_enabled: false } : {}),
  }, { onConflict: "account_id,provider,livemode" }).select("*").single();
  if (error || !upserted) throw new PaymentProviderError(500, "DB_ERROR", error?.message ?? "payment_accounts upsert failed");
  const row = upserted as PaymentAccountRow;
  const { error: secErr } = await admin.from("payment_account_secrets").upsert({
    payment_account_id: row.id, refresh_token_enc: encryptSecret(tokens.refresh_token), scope: tokens.scope ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "payment_account_id" });
  if (secErr) throw new PaymentProviderError(500, "DB_ERROR", secErr.message);
  tokenCache.set(row.id, { token: tokens.access_token, exp: Date.now() + tokens.expires_in * 1000 });
  return syncStatus(admin, row, tokens.access_token);
}

// ---- payments ----

type MolliePayment = {
  id: string; status: string; amount?: { value?: string; currency?: string }; amountRefunded?: { value?: string };
  profileId?: string; metadata?: Record<string, unknown> | null; mode?: "test" | "live";
  _links?: { checkout?: { href?: string } };
};

function mapStatus(s: string): PaymentStatus {
  if (s === "paid") return "paid";
  if (s === "expired") return "expired";
  if (s === "canceled") return "canceled";
  if (s === "failed") return "failed";
  return "open"; // open, pending, authorized
}

/** Fetch a payment with the org's token (in the org's mode). Exposed for the webhook's binding checks. */
export async function fetchMolliePayment(admin: SupabaseClient, accountId: string, paymentId: string): Promise<{ row: PaymentAccountRow; payment: MolliePayment }> {
  const row = await requireRow(admin, accountId);
  const token = await accessTokenFor(admin, row);
  const payment = await mollieFetch<MolliePayment>(token, `/payments/${encodeURIComponent(paymentId)}`, {
    query: { testmode: row.livemode ? undefined : "true" },
  });
  return { row, payment };
}

export { centsFromAmount };

export const mollieProvider: PaymentProvider = {
  id: "mollie",

  async startOnboarding(accountId, wallet, opts) {
    const owner = (opts?.owner ?? undefined) as OwnerPrefill | undefined;
    const { url } = await buildMollieOnboardingUrl(createAdminClient(), accountId, wallet, owner);
    return { url };
  },

  async refreshStatus(accountId) {
    const admin = createAdminClient();
    const row = await mollieAccountRow(admin, accountId);
    if (!row) {
      return { provider: "mollie", connected: false, canReceivePayments: false, canReceiveSettlements: false,
        onboardingStatus: "none", livemode: isMollieLivemode(), dashboardUrl: null };
    }
    return syncStatus(admin, row, await accessTokenFor(admin, row));
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const admin = createAdminClient();
    const row = await requireRow(admin, input.accountId);
    if (!row.charges_enabled || !row.profile_id) throw new PaymentProviderError(409, "CONNECT_REQUIRED", "Der Veranstalter kann noch keine Zahlungen annehmen.");
    const token = await accessTokenFor(admin, row);
    const currency = input.currency.toUpperCase();
    const payment = await mollieFetch<MolliePayment>(token, "/payments", {
      method: "POST",
      body: {
        amount: { currency, value: eurosString(input.amountCents) },
        description: input.description.slice(0, 255),
        redirectUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
        webhookUrl: `${webBaseUrl()}/api/webhooks/mollie`,
        locale: "de_DE",
        // Instant methods only: the order must be paid inside the 35-minute hold.
        // Wero once Mollie ships it in DE; SEPA direct debit only for recurring (M4).
        method: ["creditcard", "applepay", "googlepay", "paypal"],
        metadata: { kind: input.kind, orderId: input.reference, ...(input.extraMetadata ?? {}) },
        profileId: row.profile_id,
        testmode: testmode(),
        ...(input.feeCents > 0
          ? { applicationFee: { amount: { currency, value: eurosString(input.feeCents) }, description: "Plattformgebühr Röbel App" } }
          : {}),
      },
    });
    const url = payment._links?.checkout?.href;
    if (!url) throw new PaymentProviderError(502, "MOLLIE_ERROR", "Mollie hat keinen Checkout-Link geliefert.");
    return { url, providerPaymentId: payment.id, providerAccountId: row.provider_org_id ?? row.id, livemode: row.livemode };
  },

  async getPayment(accountId, providerPaymentId) {
    const { payment } = await fetchMolliePayment(createAdminClient(), accountId, providerPaymentId);
    return { status: mapStatus(payment.status), amountCents: centsFromAmount(payment.amount) };
  },

  async refund(accountId, providerPaymentId, amountCents) {
    const admin = createAdminClient();
    const { row, payment } = await fetchMolliePayment(admin, accountId, providerPaymentId);
    const token = await accessTokenFor(admin, row);
    const cents = amountCents ?? centsFromAmount(payment.amount) - centsFromAmount(payment.amountRefunded);
    // TODO(mollie-fee-refund): Mollie never refunds the application fee — the refund comes out of the
    // org's balance and Ortis keeps its fee (spec §2.1). Whether Ortis voluntarily credits it back
    // (e.g. a balance transfer or a manual credit note) is an open product decision; no compensation here.
    await mollieFetch(token, `/payments/${encodeURIComponent(providerPaymentId)}/refunds`, {
      method: "POST",
      body: { amount: { currency: (payment.amount?.currency ?? "EUR").toUpperCase(), value: eurosString(cents) }, testmode: testmode() },
    });
  },
};

export { mapStatus as mapMollieStatus };
export type { MolliePayment };
