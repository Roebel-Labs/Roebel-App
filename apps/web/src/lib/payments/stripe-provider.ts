import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConnect, isConnectLivemode, webBaseUrl } from "@/lib/stripe-connect";
import { ensureConnectedAccount } from "@/lib/tickets/connect-account";
import { connectedAccountRow, syncConnectedAccount } from "@/lib/tickets/connect-status";
import { PaymentProviderError, type PaymentProvider, type PaymentStatus } from "./types";

// Stripe Connect behind the provider seam. A wrapper only: the existing /api/connect/* routes and the
// stripe-connect webhook keep their own code paths unchanged; this lets checkout and refunds dispatch
// by provider without knowing Stripe's shapes.

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  async startOnboarding(accountId, wallet) {
    const admin = createAdminClient();
    const ensured = await ensureConnectedAccount(admin, accountId, wallet);
    if (!ensured.ok) throw new PaymentProviderError(ensured.status, ensured.code, ensured.message);
    const returnTo = encodeURIComponent("roebel://org/payments");
    const link = await stripeConnect.accountLinks.create({
      account: ensured.stripeAccountId,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
      return_url: `${webBaseUrl()}/connect/return?return_to=${returnTo}`,
      refresh_url: `${webBaseUrl()}/connect/return?refresh=true&return_to=${returnTo}`,
    });
    return { url: link.url };
  },

  async refreshStatus(accountId) {
    const s = await syncConnectedAccount(createAdminClient(), accountId);
    return {
      provider: "stripe", connected: s.connected, canReceivePayments: s.charges_enabled, canReceiveSettlements: s.payouts_enabled,
      onboardingStatus: !s.connected ? "none" : s.charges_enabled && s.payouts_enabled ? "completed" : s.currently_due.length > 0 ? "needs-data" : "in-review",
      livemode: s.livemode, dashboardUrl: s.connected ? "https://dashboard.stripe.com" : null,
    };
  },

  async createCheckout(input) {
    const connected = await connectedAccountRow(createAdminClient(), input.accountId);
    if (!connected?.charges_enabled) throw new PaymentProviderError(409, "CONNECT_REQUIRED", "Der Veranstalter kann noch keine Zahlungen annehmen.");
    const session = await stripeConnect.checkout.sessions.create(
      {
        mode: "payment", locale: "de", submit_type: "book",
        // Cards only: every other method Stripe could offer is either asynchronous (the buyer
        // leaves with no ticket and the order expires before the payment confirms) or not
        // available on a direct charge with an application fee.
        payment_method_types: ["card"],
        line_items: [{ quantity: input.quantity, price_data: { currency: input.currency, unit_amount: Math.round(input.amountCents / input.quantity),
          product_data: { name: input.description } } }],
        ...(input.feeCents > 0 ? { payment_intent_data: { application_fee_amount: input.feeCents } } : {}),
        ...(input.expiresAt ? { expires_at: Math.floor(new Date(input.expiresAt).getTime() / 1000) } : {}),
        client_reference_id: input.reference,
        customer_email: input.customerEmail ?? undefined,
        metadata: { kind: input.kind, order_id: input.reference, ...(input.extraMetadata ?? {}) },
        success_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
      { stripeAccount: connected.stripe_account_id },
    );
    if (!session.url) throw new PaymentProviderError(502, "STRIPE_ERROR", "Stripe hat keinen Checkout-Link geliefert.");
    return { url: session.url, providerPaymentId: session.id, providerAccountId: connected.stripe_account_id, livemode: isConnectLivemode() };
  },

  async getPayment(accountId, providerPaymentId) {
    const connected = await connectedAccountRow(createAdminClient(), accountId);
    if (!connected) throw new PaymentProviderError(409, "CONNECT_REQUIRED", "Kein Stripe-Konto.");
    const s = await stripeConnect.checkout.sessions.retrieve(providerPaymentId, {}, { stripeAccount: connected.stripe_account_id });
    const status: PaymentStatus = s.payment_status === "paid" ? "paid" : s.status === "expired" ? "expired" : "open";
    return { status, amountCents: s.amount_total ?? 0 };
  },

  /** `providerPaymentId` is the PaymentIntent id here (what the Stripe refund needs). */
  async refund(accountId, providerPaymentId, amountCents) {
    const connected = await connectedAccountRow(createAdminClient(), accountId);
    if (!connected) throw new PaymentProviderError(409, "CONNECT_REQUIRED", "Kein Stripe-Konto.");
    // refund_application_fee: the platform fee goes back too, so the org is never short after a refund.
    await stripeConnect.refunds.create(
      { payment_intent: providerPaymentId, refund_application_fee: true, ...(amountCents ? { amount: amountCents } : {}) },
      { stripeAccount: connected.stripe_account_id },
    );
  },
};
