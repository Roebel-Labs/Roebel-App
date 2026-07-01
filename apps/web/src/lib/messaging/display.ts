// Display-layer helpers for messaging: keep wallet addresses out of the UI and
// render marketplace inquiries consistently across web and mobile.

// Wallet-like detector. Catches full 42-char addresses AND the truncated
// "0xf42998ac..." form that some legacy `accounts.name` rows were defaulted to
// (looser than expo's strict /^0x…{40}$/, which misses the truncated names).
const WALLET_LIKE_RE = /^0x[a-fA-F0-9]{4,}(?:\.{2,}|…)?$/;

export function isWalletLike(value: string | null | undefined): boolean {
  if (!value) return false;
  return WALLET_LIKE_RE.test(value.trim());
}

/**
 * Never render a wallet address as a display name. Prefer a real username,
 * then a non-wallet name, else a friendly fallback.
 *
 * Mirrors apps/expo/lib/supabase-messages.ts `safeDisplayName`.
 */
export function safeDisplayName(
  name: string | null | undefined,
  username?: string | null
): string {
  if (username && !isWalletLike(username)) return username;
  if (name && !isWalletLike(name)) return name;
  return "Unbekannt";
}

export interface ListingInquiry {
  type: "listing_inquiry" | "product_inquiry";
  listingId: string;
  title: string;
  price: number;
  priceType: string;
  imageUrl?: string | null;
  condition?: string | null;
}

/**
 * Parse a marketplace inquiry message. Mobile writes `listing_inquiry`, web
 * historically wrote `product_inquiry` — accept BOTH so neither app leaks raw
 * JSON into the chat. Mirrors apps/expo MessageBubble.tryParseListingInquiry.
 */
export function parseListingInquiry(content: string): ListingInquiry | null {
  try {
    const parsed = JSON.parse(content);
    if (
      (parsed?.type === "listing_inquiry" ||
        parsed?.type === "product_inquiry") &&
      parsed.listingId &&
      parsed.title
    ) {
      return {
        type: parsed.type,
        listingId: parsed.listingId,
        title: parsed.title,
        price: parsed.price ?? 0,
        priceType: parsed.priceType ?? "fixed",
        imageUrl: parsed.imageUrl ?? null,
        condition: parsed.condition ?? null,
      };
    }
  } catch {
    // not JSON — plain text message
  }
  return null;
}

export function formatListingPrice(price: number, priceType: string): string {
  if (priceType === "free") return "Kostenlos";
  if (priceType === "negotiable") return `${price.toFixed(2)} € VB`;
  return `${price.toFixed(2)} €`;
}
