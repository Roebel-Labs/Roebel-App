// Livestream sponsoring (DanceCup 2026 first): pure helpers for /api/sponsoring.
// Relative-import safe so `npx tsx --test` can load it.

/** RPC errors of book_sponsoring_package → HTTP status + German copy. */
export const BOOK_ERRORS: Record<string, [number, string]> = {
  not_on_sale: [409, "Dieses Paket ist gerade nicht buchbar."],
  deadline_passed: [409, "Die Buchungsfrist ist abgelaufen."],
  media_kind_not_accepted: [400, "Dieses Paket erlaubt diese Dateiart nicht."],
  already_booked: [409, "Ihr habt dieses Paket schon angefragt."],
  sold_out: [409, "Leider ausgebucht."],
};

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
