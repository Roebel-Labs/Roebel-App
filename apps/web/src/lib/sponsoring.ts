// Livestream sponsoring (DanceCup 2026 first): pure helpers for /api/sponsoring.
// Relative-import safe so `npx tsx --test` can load it.

/** RPC errors of book_sponsoring_package → HTTP status + German copy. */
export const BOOK_ERRORS: Record<string, [number, string]> = {
  not_on_sale: [409, "Dieses Paket ist gerade nicht buchbar."],
  deadline_passed: [409, "Die Buchungsfrist ist abgelaufen."],
  media_kind_not_accepted: [400, "Dieses Paket erlaubt diese Dateiart nicht."],
  already_booked: [409, "Ihr habt dieses Paket schon gebucht."],
  sold_out: [409, "Leider ausgebucht."],
  bad_creative: [400, "Dieses Werbebild gehört nicht zu eurer Organisation."],
};

/** Invoice footer for Max's Kleinunternehmen (MüritzPhone). */
export const KLEINUNTERNEHMER_FOOTER = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

/** Deep link back into the app after Stripe Checkout (allow-listed on /sponsoring/return). */
export function sponsoringReturnUrl(slug: string): string {
  return `roebel://org/sponsoring/${slug}`;
}
export const SPONSORING_RETURN_ALLOW = /^roebel:\/\/org\/sponsoring\/[a-z0-9-]{3,60}$/;

/** The RPC error code inside a Postgres error message, if it is one of ours. */
export function bookErrorCode(message: string | null | undefined): string | null {
  if (!message) return null;
  return Object.keys(BOOK_ERRORS).find((code) => message.includes(code)) ?? null;
}

/**
 * Uploaded media must come from our own storage: the Supabase public bucket or Cloudflare
 * Stream. Anything else (a link to a random site) is refused so the stream never airs it.
 */
export function isAllowedMediaUrl(url: string, supabaseUrl: string | undefined): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (supabaseUrl) {
    try {
      const s = new URL(supabaseUrl);
      if (u.host === s.host && u.pathname.startsWith("/storage/v1/object/public/")) return true;
    } catch {
      // fall through
    }
  }
  return /(^|\.)cloudflarestream\.com$/.test(u.host) || /^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(u.host);
}

/** Wallets that get a push for every new booking (Max by default; env override, comma-separated). */
export function bookingNotifyWallets(env: string | undefined): string[] {
  const list = (env ?? "0xc49de63ccfee46c6c5c3e393293f66779799fb28")
    .split(",").map((w) => w.trim().toLowerCase()).filter((w) => /^0x[a-f0-9]{40}$/.test(w));
  return [...new Set(list)];
}

export function formatEuro(cents: number): string {
  return `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: cents % 100 ? 2 : 0 })} €`;
}

/**
 * Background colour of a logo, read from its border: the most frequent opaque edge colour
 * (4-bit buckets, then averaged inside the winning bucket). `rgba` is raw RGBA, row-major.
 * Mostly transparent edges → null (the caller shows the logo on white).
 */
export function logoEdgeColor(rgba: Uint8Array, width: number, height: number): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let edge = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      edge++;
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 128) continue;
      const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
      const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += rgba[i]; b.g += rgba[i + 1]; b.b += rgba[i + 2];
      buckets.set(key, b);
    }
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  let opaque = 0;
  for (const b of buckets.values()) {
    opaque += b.n;
    if (!best || b.n > best.n) best = b;
  }
  if (!best || opaque < edge * 0.5) return null;
  const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`.toUpperCase();
}
