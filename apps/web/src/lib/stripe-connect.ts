import Stripe from "stripe";

// Stripe Connect client for event tickets. Sandbox key until the platform is approved,
// then STRIPE_CONNECT_SECRET_KEY becomes the live key. Lazy like lib/stripe.ts so a
// missing key never breaks `next build`.
function readConnectKey(): string | undefined {
  return process.env.STRIPE_CONNECT_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY_SANDBOX;
}

let client: Stripe | null = null;
export const stripeConnect: Stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    if (!client) {
      const key = readConnectKey();
      if (!key) throw new Error("STRIPE_CONNECT_SECRET_KEY (or STRIPE_SECRET_KEY_SANDBOX) is not set.");
      client = new Stripe(key);
    }
    return Reflect.get(client, prop, client);
  },
});

export function isConnectLivemode(): boolean {
  return (readConnectKey() ?? "").startsWith("sk_live_");
}

export function isConnectConfigured(): boolean {
  return !!readConnectKey();
}

/** Platform fee for one paid order: bps of amount + fixed part, capped so the org always nets ≥ 1 ct. */
export function platformFeeCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  const bps = Number(process.env.STRIPE_PLATFORM_FEE_BPS ?? "200");
  const fixed = Number(process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS ?? "10");
  const raw = Math.round((amountCents * (Number.isFinite(bps) ? bps : 0)) / 10000) + (Number.isFinite(fixed) ? fixed : 0);
  return Math.max(0, Math.min(raw, amountCents - 1));
}

export function webBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "https://www.roebel.app").replace(/\/$/, "");
}

/**
 * Publishable key of the same Stripe account and mode as the Connect secret key. Public by design
 * (it can only create client-side tokens), served by /api/connect/session so a sandbox→live switch
 * needs no app update. Returns null when missing or when its mode does not match the secret key.
 */
export function connectPublishableKey(): string | null {
  const pk = process.env.STRIPE_CONNECT_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLIC_KEY_SANDBOX ?? "";
  if (!/^pk_(live|test)_/.test(pk)) return null;
  const live = isConnectLivemode();
  if (pk.startsWith("pk_live_") !== live) return null;
  return pk;
}
