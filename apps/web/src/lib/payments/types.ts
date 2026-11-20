// Provider seam for the payment rails (design: docs/superpowers/specs/2026-11-18-mollie-payments-design.md §3.1).
// Each org connects its own account at a provider; Ortis only adds an application fee and never holds funds.

export type PaymentProviderId = "mollie" | "stripe";

/** Labels the app shows next to each provider; served by /api/payments/status so the app never hardcodes them. */
export const PROVIDER_LABELS: Record<PaymentProviderId, { name: string; subtitle: string }> = {
  mollie: { name: "Mollie", subtitle: "EU-Anbieter (Niederlande)" },
  stripe: { name: "Stripe", subtitle: "US-Anbieter" },
};

export type OnboardingStatus = "none" | "needs-data" | "in-review" | "completed";

export type PaymentAccountStatus = {
  provider: PaymentProviderId;
  connected: boolean;
  /** Payments can be taken (Mollie canReceivePayments / Stripe charges_enabled). */
  canReceivePayments: boolean;
  /** Payouts are released (Mollie canReceiveSettlements / Stripe payouts_enabled). */
  canReceiveSettlements: boolean;
  onboardingStatus: OnboardingStatus;
  livemode: boolean;
  /** Provider dashboard link for the org, when the provider hands one out. */
  dashboardUrl: string | null;
};

export type PaymentStatus = "open" | "paid" | "failed" | "expired" | "canceled";

export type CheckoutInput = {
  accountId: string;
  amountCents: number;
  feeCents: number;
  currency: string;
  quantity: number;
  description: string;
  /** Our order id; goes into the provider metadata and is the only thing the webhook trusts it for. */
  reference: string;
  kind: string;
  expiresAt: string | null;
  returnUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  extraMetadata?: Record<string, string>;
};

export type CheckoutResult = {
  url: string;
  providerPaymentId: string;
  /** The provider-side account the payment was created on (Stripe acct_…, Mollie org_…). */
  providerAccountId: string;
  livemode: boolean;
};

export interface PaymentProvider {
  id: PaymentProviderId;
  startOnboarding(accountId: string, wallet: string, opts?: Record<string, unknown>): Promise<{ url: string }>;
  refreshStatus(accountId: string): Promise<PaymentAccountStatus>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  getPayment(accountId: string, providerPaymentId: string): Promise<{ status: PaymentStatus; amountCents: number }>;
  refund(accountId: string, providerPaymentId: string, amountCents?: number): Promise<void>;
}

export class PaymentProviderError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
