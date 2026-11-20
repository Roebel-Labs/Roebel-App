#!/usr/bin/env node
// Mollie test-mode smoke test (phase M1 of docs/superpowers/specs/2026-11-18-mollie-payments-design.md).
//
// Usage (from the repo root, Node >= 20.6 for --env-file):
//   node --env-file=apps/web/.env.local apps/web/scripts/mollie-smoke.mjs payment [amountCents=100]
//   node --env-file=apps/web/.env.local apps/web/scripts/mollie-smoke.mjs get tr_…
//   node --env-file=apps/web/.env.local apps/web/scripts/mollie-smoke.mjs methods
//   node --env-file=apps/web/.env.local apps/web/scripts/mollie-smoke.mjs onboarding-url [accountId]
//
// payment/get/methods use MOLLIE_API_KEY_TEST (test_…). Live keys are refused on purpose: this script
// must never create a real charge. An API key cannot carry an applicationFee (OAuth only), so the fee
// path is exercised by the real onboarding + checkout flow, not here.
//
// onboarding-url prints the plain OAuth authorize URL for a manual browser test (needs MOLLIE_CLIENT_ID;
// the `state` printed here is a dummy — the callback will reject it, which is the point: it proves the
// redirect URI is registered and Mollie hands back `code`). Real onboarding starts in the app.

const API = "https://api.mollie.com/v2";
const base = (process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "https://www.roebel.app").replace(/\/$/, "");
const [command, ...args] = process.argv.slice(2);

const SCOPES = [
  "payments.read", "payments.write", "refunds.read", "refunds.write",
  "onboarding.read", "onboarding.write", "profiles.read", "profiles.write",
  "organizations.read", "clients.write", "payment-links.read", "payment-links.write",
  "customers.read", "customers.write", "mandates.read", "mandates.write",
  "subscriptions.read", "subscriptions.write", "terminals.read", "terminals.write",
  "balances.read", "settlements.read", "invoices.read",
].join(" ");

function testKey() {
  const key = process.env.MOLLIE_API_KEY_TEST ?? "";
  if (key.startsWith("live_")) {
    console.error("Refusing to run: MOLLIE_API_KEY_TEST is a live key. Only test_ keys are used here.");
    process.exit(1);
  }
  if (!key.startsWith("test_")) {
    console.error("Set MOLLIE_API_KEY_TEST to the platform's test API key (test_…).");
    process.exit(1);
  }
  return key;
}

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${testKey()}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HTTP ${res.status}`, JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

function pick(p) {
  return { id: p.id, mode: p.mode, status: p.status, amount: p.amount, method: p.method, profileId: p.profileId,
    metadata: p.metadata, expiresAt: p.expiresAt, checkout: p._links?.checkout?.href ?? null };
}

if (command === "payment") {
  const cents = Number(args[0] ?? "100");
  const p = await call("/payments", {
    method: "POST",
    body: {
      amount: { currency: "EUR", value: (cents / 100).toFixed(2) },
      description: "Ortis Smoke-Test Ticket",
      redirectUrl: `${base}/tickets/return?order_id=smoke&return_to=${encodeURIComponent("roebel://tickets")}`,
      cancelUrl: `${base}/tickets/return?cancelled=true&order_id=smoke&return_to=${encodeURIComponent("roebel://tickets")}`,
      locale: "de_DE",
      metadata: { kind: "smoke", orderId: "smoke" },
    },
  });
  console.log(JSON.stringify(pick(p), null, 2));
  const again = await call(`/payments/${p.id}`);
  console.log("fetched back:", again.id, again.status);
  console.log("\nCheckout URL:", p._links?.checkout?.href);
} else if (command === "get") {
  if (!args[0]) { console.error("usage: get tr_…"); process.exit(1); }
  console.log(JSON.stringify(pick(await call(`/payments/${args[0]}`)), null, 2));
} else if (command === "methods") {
  const m = await call("/methods");
  console.log((m._embedded?.methods ?? []).map((x) => `${x.id}\t${x.status ?? ""}\t${x.description}`).join("\n"));
} else if (command === "onboarding-url") {
  const clientId = process.env.MOLLIE_CLIENT_ID ?? "";
  if (!clientId) { console.error("Set MOLLIE_CLIENT_ID (app_…)."); process.exit(1); }
  const u = new URL("https://my.mollie.com/oauth2/authorize");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", `${base}/api/payments/mollie/callback`);
  u.searchParams.set("state", `smoke-${args[0] ?? "no-account"}`);
  u.searchParams.set("scope", process.env.MOLLIE_OAUTH_SCOPES || SCOPES);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("approval_prompt", "force");
  console.log(u.toString());
} else {
  console.error("commands: payment [amountCents] | get tr_… | methods | onboarding-url [accountId]");
  process.exit(1);
}
