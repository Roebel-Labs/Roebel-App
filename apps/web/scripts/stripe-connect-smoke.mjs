#!/usr/bin/env node
// Stripe Connect sandbox smoke test (Phase 0 of docs/future-research/2026-09-21_STRIPE_CONNECT_ASSESSMENT.md).
//
// Proves the recommended shape end to end on ONE test connected account:
// full dashboard, Stripe collects fees and losses, direct charge with an application fee.
//
// Usage (from the repo root, Node >= 20.6 for --env-file):
//   node --env-file=apps/web/.env.local apps/web/scripts/stripe-connect-smoke.mjs account  acct_…
//   node --env-file=apps/web/.env.local apps/web/scripts/stripe-connect-smoke.mjs link     acct_…
//   node --env-file=apps/web/.env.local apps/web/scripts/stripe-connect-smoke.mjs checkout acct_… [amountCents=100] [feeCents=10]
//   node --env-file=apps/web/.env.local apps/web/scripts/stripe-connect-smoke.mjs session  acct_… cs_test_…
//   node --env-file=apps/web/.env.local apps/web/scripts/stripe-connect-smoke.mjs fees
//
// Key: STRIPE_SECRET_KEY_SANDBOX (sk_test_… from the Sandbox's Entwickler → API-Schlüssel page).
// Live keys are refused on purpose; this script must never create a real charge.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Stripe = require("stripe");

const key = process.env.STRIPE_SECRET_KEY_SANDBOX ?? "";
if (!/^(sk|rk)_test_/.test(key)) {
  console.error(
    "Refusing to run: set STRIPE_SECRET_KEY_SANDBOX to a sandbox/test secret key (sk_test_…). Live keys are never used here.",
  );
  process.exit(1);
}
const stripe = new Stripe(key);

const [command, ...args] = process.argv.slice(2);

function pick(account) {
  const c = account.controller ?? {};
  return {
    id: account.id,
    country: account.country,
    business_type: account.business_type,
    fees_payer: c.fees?.payer,
    losses_payments: c.losses?.payments,
    dashboard: c.stripe_dashboard?.type,
    requirement_collection: c.requirement_collection,
    details_submitted: account.details_submitted,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    capabilities: account.capabilities,
    currently_due: account.requirements?.currently_due ?? [],
    eventually_due: account.requirements?.eventually_due ?? [],
    disabled_reason: account.requirements?.disabled_reason ?? null,
  };
}

function expectedShape(view) {
  const problems = [];
  if (view.fees_payer !== "account") problems.push(`fees_payer is "${view.fees_payer}", expected "account" (Stripe bills the org)`);
  if (view.losses_payments !== "stripe") problems.push(`losses_payments is "${view.losses_payments}", expected "stripe"`);
  if (view.dashboard !== "full") problems.push(`dashboard is "${view.dashboard}", expected "full"`);
  if (view.requirement_collection !== "stripe") problems.push(`requirement_collection is "${view.requirement_collection}", expected "stripe"`);
  return problems;
}

async function account(acct) {
  const view = pick(await stripe.accounts.retrieve(acct));
  console.log(JSON.stringify(view, null, 2));
  const problems = expectedShape(view);
  console.log(problems.length ? `\nSHAPE PROBLEMS:\n- ${problems.join("\n- ")}` : "\nShape OK: full dashboard, Stripe collects fees and losses, Stripe collects requirements.");
  if (!view.charges_enabled) console.log("charges_enabled is false: finish the hosted onboarding first (run `link` for a fresh URL).");
}

async function link(acct) {
  const accountLink = await stripe.accountLinks.create({
    account: acct,
    type: "account_onboarding",
    collection_options: { fields: "eventually_due" },
    refresh_url: "https://roebel.app/?stripe_smoke=refresh",
    return_url: "https://roebel.app/?stripe_smoke=return",
  });
  console.log("Open this once, within a few minutes, in a normal browser:\n" + accountLink.url);
}

async function checkout(acct, amountCents = "100", feeCents = "10") {
  const amount = Number(amountCents);
  const fee = Number(feeCents);
  if (!Number.isInteger(amount) || amount < 50) throw new Error("amountCents must be an integer >= 50");
  if (!Number.isInteger(fee) || fee < 0 || fee >= amount) throw new Error("feeCents must be an integer in [0, amountCents)");

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      locale: "de",
      submit_type: "book",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amount,
            product_data: { name: "Testticket (Connect-Smoke, keine echte Zahlung)" },
          },
        },
      ],
      ...(fee > 0 ? { payment_intent_data: { application_fee_amount: fee } } : {}),
      metadata: { purpose: "connect-smoke" },
      success_url: "https://roebel.app/?stripe_smoke=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://roebel.app/?stripe_smoke=cancel",
    },
    { stripeAccount: acct },
  );
  console.log(`Checkout Session ${session.id} on ${acct} (direct charge, fee ${fee} ct):\n${session.url}\nPay with 4242 4242 4242 4242, then run: session ${acct} ${session.id}`);
}

async function session(acct, sessionId) {
  const s = await stripe.checkout.sessions.retrieve(
    sessionId,
    { expand: ["payment_intent.latest_charge.balance_transaction"] },
    { stripeAccount: acct },
  );
  const pi = s.payment_intent;
  const charge = pi?.latest_charge;
  const bt = charge?.balance_transaction;
  const feeDetails = bt?.fee_details?.map((f) => ({ type: f.type, amount: f.amount, description: f.description })) ?? [];
  console.log(
    JSON.stringify(
      {
        session: s.id,
        payment_status: s.payment_status,
        amount_total: s.amount_total,
        payment_intent: pi?.id,
        application_fee_amount: pi?.application_fee_amount ?? null,
        charge: charge?.id,
        balance_transaction: bt ? { gross: bt.amount, stripe_and_application_fees: bt.fee, net_to_org: bt.net, fee_details: feeDetails } : null,
      },
      null,
      2,
    ),
  );
}

async function fees() {
  const list = await stripe.applicationFees.list({ limit: 5 });
  console.log(
    JSON.stringify(
      list.data.map((f) => ({ id: f.id, account: f.account, amount: f.amount, currency: f.currency, refunded: f.refunded, created: new Date(f.created * 1000).toISOString() })),
      null,
      2,
    ),
  );
}

const commands = { account, link, checkout, session, fees };
const run = commands[command];
if (!run) {
  console.error(`Unknown command "${command ?? ""}". Commands: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
run(...args).catch((err) => {
  console.error(err?.raw?.message ?? err?.message ?? err);
  process.exit(1);
});
