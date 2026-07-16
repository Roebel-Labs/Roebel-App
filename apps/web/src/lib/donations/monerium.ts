import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { DONATION_CONFIG } from "./config";

// ---------------------------------------------------------------------------
// Monerium webhook signature verification
// ---------------------------------------------------------------------------
//
// Monerium signs webhooks Svix-style (docs.monerium.com/whitelabel):
//   webhook-signature: v1,<base64 HMAC-SHA256>
// over the string  `${webhook-id}.${webhook-timestamp}.${raw body}`
// with the key = base64-decode(secret without the `whsec_` prefix).
// Retried events reuse the same webhook-id → store processed ids.

export function verifyMoneriumSignature(opts: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  const { rawBody, webhookId, webhookTimestamp, signatureHeader, secret } = opts;
  if (!webhookId || !webhookTimestamp || !signatureHeader) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", key)
    .update(signedContent)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  // The header may carry several space-separated versioned signatures
  // (Svix format) — accept if ANY matches.
  return signatureHeader.split(" ").some((part) => {
    const sig = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    const sigBuf = Buffer.from(sig);
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}

// ---------------------------------------------------------------------------
// Monerium order event payload (order.created / order.updated)
// ---------------------------------------------------------------------------

export interface MoneriumOrderEvent {
  type: string; // "order.created" | "order.updated" | "profile.updated" | ...
  timestamp?: string;
  data?: {
    id?: string;
    kind?: "issue" | "redeem";
    amount?: string;
    memo?: string;
    address?: string;
    chain?: string;
    currency?: string;
    state?: "placed" | "pending" | "processed" | "rejected";
    meta?: {
      txHashes?: string[];
      rejectedReason?: string;
    };
  };
}

/** Monerium amounts are decimal strings of euros (e.g. "25.00") → cents. */
export function moneriumAmountToCents(amount: string | undefined): number | null {
  if (!amount) return null;
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

// ---------------------------------------------------------------------------
// Donation settings (app_settings-backed, admin-editable without a deploy)
// ---------------------------------------------------------------------------

export interface DonationSettings {
  enabled: boolean;
  iban: string | null;
  bic: string | null;
  recipient: string | null;
}

let settingsCache: { value: DonationSettings; fetchedAt: number } | null = null;
const SETTINGS_TTL_MS = 5 * 60 * 1000;

const SETTINGS_KEYS = [
  "donations_enabled",
  "donation_iban",
  "donation_bic",
  "donation_recipient_name",
] as const;

export async function getDonationSettings(): Promise<DonationSettings> {
  if (settingsCache && Date.now() - settingsCache.fetchedAt < SETTINGS_TTL_MS) {
    return settingsCache.value;
  }

  const map = new Map<string, string>();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [...SETTINGS_KEYS]);
    if (error) {
      console.error("[donations] app_settings read failed", error);
    }
    for (const row of data ?? []) {
      if (row.key && row.value != null) map.set(row.key as string, String(row.value));
    }
  } catch (err) {
    console.error("[donations] app_settings read threw", err);
  }

  const iban = map.get("donation_iban") ?? process.env.DONATION_IBAN ?? null;
  const value: DonationSettings = {
    // Kill switch: missing key counts as DISABLED (unlike xmtp_dms_enabled) —
    // we must never show a half-configured IBAN flow.
    enabled: (map.get("donations_enabled") ?? "false") === "true" && !!iban,
    iban,
    bic: map.get("donation_bic") ?? process.env.DONATION_BIC ?? null,
    recipient:
      map.get("donation_recipient_name") ??
      process.env.DONATION_RECIPIENT_NAME ??
      null,
  };
  settingsCache = { value, fetchedAt: Date.now() };
  return value;
}

/** Public config payload shared by /api/donate/config and the /spenden page. */
export async function getPublicDonationConfig() {
  const settings = await getDonationSettings();
  return {
    enabled: settings.enabled,
    iban: settings.iban,
    bic: settings.bic,
    recipient: settings.recipient,
    presets_cents: DONATION_CONFIG.PRESET_AMOUNTS_CENTS,
    min_cents: DONATION_CONFIG.MIN_AMOUNT_CENTS,
    max_cents: DONATION_CONFIG.MAX_AMOUNT_CENTS,
  };
}
