# Mollie as the default payment rail — design

**Date:** 2026-11-18 · **Status:** draft for Max's approval · **Decision by Max (2026-11-18):** Mollie becomes the
default payment provider for Ortis; Stripe stays as a second rail for accounts that already use it.

## 1. Why

- Mollie is a Dutch payment institution (licensed by De Nederlandsche Bank): an EU contract partner, matching the
  sovereignty line ("Unabhängig werden", DSGVO, the public-sector end game).
- Since 2026-09-01 Mollie owns GoCardless (bank payments, SEPA direct debit, Pay by Bank): recurring payments for
  gyms and Vereine are first-class.
- Same legal shape as our Stripe setup: each business has its own Mollie account, Ortis only adds an application
  fee, Ortis never holds funds → no ZAG/BaFin licence needed (same reasoning as
  `docs/future-research/2026-09-21_STRIPE_CONNECT_ASSESSMENT.md`).
- Onboarding is a browser OAuth/Client-Link flow, no native SDK → ships by OTA, no store build.

## 2. Mollie facts this design relies on (verify against mollie.com/de/pricing before go-live)

| Item | Value | Source quality |
|---|---|---|
| EEA consumer cards (incl. Apple Pay/Google Pay) | 1.80 % + €0.25 | several third-party DE sources; easybill lists 1.65 % + €0.19 (negotiated?) |
| EEA business cards | 2.90 % + €0.25 | third-party |
| Non-EEA cards | 3.25 % + €0.25 | third-party |
| SEPA direct debit | €0.35 flat | third-party (easybill: €0.28) |
| PayPal | PayPal's fee + €0.10 | third-party |
| Wero / iDEAL | ~€0.42 flat | one source |
| Monthly fee | none | third-party |
| Application fee cap (Payments API) | amount − (€0.35 + 6 % of amount) | docs.mollie.com |
| Connect models | Application fees (business pays Mollie's fee, ours on top) **or** Resell pricing (platform pays Mollie, charges own price) — not both on one payment | docs.mollie.com |
| VAT on application fees | platform must invoice connected accounts and handle VAT | docs.mollie.com |
| Onboarding | OAuth app (Mollie dashboard → Developers → Apps) + Client Links API (pre-filled, co-branded) + Onboarding API (status) | docs.mollie.com |
| In person | Tap to Pay on iPhone in DE (Mollie app, since 2024-11); Mollie terminals; Terminal API (`method: pointofsale`) | mollie.com |
| Multi-seller checkout | Connect for Marketplaces: split payments / routing | docs.mollie.com |

### 2.1 Research + test-key probe (2026-11-18)

Live probe with the platform test API key:
- Payments API works: test payment `tr_…` created, hosted checkout returned. Customers API works.
- Activated methods on the profile: only `creditcard` + `ideal`. Apple Pay, Google Pay, PayPal, direct debit must be
  enabled in the dashboard. **Wero is not in `/v2/methods/all`.**
- Payment Links fail ("no payment methods enabled for this profile") until methods are enabled.
- `applicationFee` with an API key → 422 "Application fees are only allowed for OAuth payments" (expected).

Settled by docs (docs.mollie.com):
- **Application fees are non-refundable:** a refund comes from the merchant's balance, the platform keeps its fee.
  Decide whether Ortis voluntarily credits the fee back on refunds (fairness for Vereine). Chargeback handling of the
  fee unconfirmed.
- `applicationFee` works on Payments API, Payment Links (OAuth + `profileId`) and **Subscriptions** (charged on every
  payment) → M4 is unblocked. Orders API is deprecated (fee capped 10 % / €2) → don't use it.
- OAuth: access token 60 min, refresh token persistent, auth code valid 30 s. **Adding scopes later forces every
  merchant to re-authorize → request the full set on day one:** `payments.*`, `refunds.*`, `onboarding.*`,
  `profiles.*`, `organizations.read`, `clients.write`, `payment-links.*`, `customers.*`, `mandates.*`,
  `subscriptions.*`, `terminals.*`, `balances.read`, `settlements.read`, `invoices.read`.
- Client Links pre-fill owner name/email, org name, address, registration number, VAT number (VIES-checked), legal
  entity; link valid 30 days. Onboarding API: `needs-data` / `in-review` / `completed` with `canReceivePayments` and
  `canReceiveSettlements` → payments can start before payouts are released; show both states in the UI.
- **Signed webhooks exist** ("next-gen", `X-Mollie-Signature` HMAC-SHA256, max 3 live subscriptions per org;
  refunds/chargebacks events still beta). Keep the fetch-back pattern for payments; optional signature check.
- Balance transfers (dashboard "Partners → Balance transfers") are only for merchant-consented fees owed to the
  platform (e.g. monthly SaaS fee), €1,000/month cap, must be enabled by Mollie — never for forwarding shopper money.
- Wero: Mollie page says "coming soon", ecommerce H2 2026 → drop from M1 method list. giropay is dead (since
  2024-06-30). Google Pay is still beta on hosted checkout.
- Data: Mollie states storage on Dutch servers; check the subprocessor list (reported Google Cloud) for the DPIA.
- DE pricing confirmed on mollie.com/de/pricing: Klarna 2.99 % + €0.35, bank transfer €0.25, Pay by Bank
  0.45 % + €0.25; card / SEPA / PayPal as in the table above.

Still open: whether Connect must be requested or is on by default for our account; whether the full OAuth +
Client Link flow runs in test mode before our own KYB; partner-programme revenue share (apply via
mollie.com/contact/connect); application fees on terminal payments.

## 3. Design

### 3.1 Provider seam

`apps/web/src/lib/payments/` with one interface, two providers:

```ts
interface PaymentProvider {
  id: "mollie" | "stripe";
  startOnboarding(accountId, wallet): Promise<{ url: string }>;
  refreshStatus(accountId): Promise<PaymentAccountStatus>;   // charges/payouts enabled, requirements
  createCheckout(input: { accountId; amountCents; feeCents; description; reference; expiresAt; returnUrl;
                          methods?: Method[] }): Promise<{ url: string; providerPaymentId: string }>;
  getPayment(accountId, providerPaymentId): Promise<{ status: "open"|"paid"|"failed"|"expired"|"canceled"; amountCents }>;
  refund(accountId, providerPaymentId, amountCents?): Promise<void>;
}
```

`createCheckout` picks the provider from the org's connected payment account. New orgs get Mollie; orgs with an
existing Stripe account keep Stripe until they switch.

### 3.2 Data

- New table `payment_accounts` (account_id, provider, provider_org_id, profile_id, livemode, charges_enabled,
  payouts_enabled, status, created_by_wallet, timestamps), unique (account_id, provider, livemode).
  `stripe_connected_accounts` stays and is read through the Stripe provider.
- OAuth refresh tokens: never in a client-readable table; separate `payment_account_secrets` (service role only),
  encrypted with a server key (`PAYMENT_TOKEN_KEY`), access tokens cached in memory only.
- `ticket_orders.rail` gains `'mollie'`; add `provider_payment_id`. Sponsoring/donation orders get the same pair.

### 3.3 Flows

- **Onboarding:** org owner/admin taps "Zahlungen einrichten" → signed request → server creates a Client Link
  (pre-filled org name, address, email) → browser → Mollie KYB → OAuth callback `/api/payments/mollie/callback`
  stores tokens, resolves the organization + website profile → status via Onboarding API.
- **Checkout:** Payments API with the org's OAuth token, `profileId`, `applicationFee`
  (`STRIPE_PLATFORM_FEE_*` renamed to `PLATFORM_FEE_BPS` / `PLATFORM_FEE_FIXED_CENTS`, same 2 % + €0.10),
  `redirectUrl` = existing return pages, `webhookUrl` = `/api/webhooks/mollie`, `metadata.kind` + order id,
  `expiresAt` for the 35-min hold. Methods for instant fulfilment: creditcard, applepay, googlepay, paypal (wero once Mollie ships it in DE).
  SEPA direct debit only for recurring (async).
- **Webhook:** Mollie posts only `id` → we look up which order/account owns it, fetch the payment with that org's
  token, settle by status, bound to account + order + amount (same rules as `webhooks/stripe-connect`),
  idempotent via a `payment_events` table.
- **Refunds:** Refunds API with the org token; fee reversal per the open check above.

### 3.4 Rollout phases

| Phase | Scope | Ships by |
|---|---|---|
| **M1** | provider seam, `payment_accounts`, Mollie onboarding + status, tickets on Mollie, webhook, refunds, org payments screen with Mollie as default, test mode end to end | OTA + migration |
| M2 | sponsoring, live-room support, donations on the seam | OTA |
| M3 | mini-app `sdk.actions.pay()` → host checkout on the mini-app owner's account (after miniapp-4 merges) | OTA |
| M4 | recurring: Mollie customers + mandates + subscriptions (gym memberships, Verein dues by SEPA direct debit) | OTA |
| M5 | Terminal API: Ortis pushes a payment to the business's Mollie terminal / Tap to Pay | later |

### 3.5 Store rules

Physical goods and services (tickets, memberships, rooms, food) may use Mollie in the app. Digital content used
inside the app stays out of mini-app `pay()` (Apple/Google IAP rules).

## 4. Max's gates (not code)

1. Mollie account for the platform business (MüritzPhone or the future entity); test mode works before KYB.
2. Register an OAuth app in the Mollie dashboard (redirect `https://www.roebel.app/api/payments/mollie/callback`),
   ask Mollie to enable Connect / application fees; put `MOLLIE_CLIENT_ID`, `MOLLIE_CLIENT_SECRET`,
   `MOLLIE_API_KEY_TEST`, `PAYMENT_TOKEN_KEY` into Vercel.
3. Steuerberater: VAT on application fees (§ 19 UStG status) before the first live fee.
4. Apply migrations in the SQL editor (MCP DDL on prod gets blocked).
