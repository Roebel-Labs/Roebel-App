// Output shaping for model-facing tool results: scrub wallet addresses,
// clip long strings, keep the serialized JSON under a char budget by
// trimming the longest lists first. Pure, no I/O.

// Full 20-byte addresses (not the prefix of a longer hash such as a
// proposal id) and shortened forms like "0xd7ca07c0..." / "0xd7ca…1234".
const WALLET_RE = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])|0x[a-fA-F0-9]{4,}(?:\.{2,3}|…)[a-fA-F0-9]*/g;
export const WALLET_PLACEHOLDER = "[Adresse ausgeblendet]";

/** Replace every 0x… wallet/contract address (full or shortened) in a string. */
export function scrubWallets(s: string): string {
  return s.replace(WALLET_RE, WALLET_PLACEHOLDER);
}

/** True when a display-name field actually holds a (shortened) address. */
export function looksLikeWallet(s: string | null | undefined): boolean {
  return !!s && /^0x[a-fA-F0-9]{4,}/.test(s.trim());
}

export function clip(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  const t = String(s);
  return t.length > max ? `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…` : t;
}

/** Keys that must never reach the model even if a query selected them. */
const FORBIDDEN_KEYS = new Set([
  "wallet",
  "wallet_address",
  "owner_wallet_address",
  "seller_wallet_address",
  "holder_wallet",
  "buyer_wallet",
  "recipient_wallet",
  "user_wallet",
  "proposer_address",
  "checked_in_by_wallet",
  "redeemed_by",
  "email",
  "phone",
  "phone_number",
  "contact_email",
  "organizer_email",
  "organizer_phone",
  "buyer_email",
  "author_email",
]);

function deepMap(v: unknown, maxString: number): unknown {
  if (typeof v === "string") return clip(scrubWallets(v), maxString);
  if (Array.isArray(v)) return v.map((x) => deepMap(x, maxString));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      if (val === undefined) continue;
      out[k] = deepMap(val, maxString);
    }
    return out;
  }
  return v;
}

/** Find the longest (by serialized size) array with ≥ 1 item anywhere in the tree. */
function longestArray(v: unknown): unknown[] | null {
  let best: unknown[] | null = null;
  let bestSize = -1;
  const walk = (x: unknown) => {
    if (Array.isArray(x)) {
      if (x.length > 0) {
        const size = JSON.stringify(x).length;
        if (size > bestSize) {
          best = x;
          bestSize = size;
        }
      }
      x.forEach(walk);
    } else if (x && typeof x === "object") {
      Object.values(x as Record<string, unknown>).forEach(walk);
    }
  };
  walk(v);
  return best;
}

export interface ShapeOptions {
  /** Max serialized JSON length (default 4000). */
  maxChars?: number;
  /** Max length of any single string (default 600). */
  maxString?: number;
}

/**
 * Model-safe, compact copy of `value`. Wallet addresses and contact fields
 * are removed; strings clipped; lists trimmed until the JSON fits. When
 * anything was dropped, the root object gets `gekuerzt: true`.
 */
export function shapeOutput<T>(value: T, opts: ShapeOptions = {}): T {
  const maxChars = opts.maxChars ?? 4000;
  const maxString = opts.maxString ?? 600;
  let out = deepMap(value, maxString);
  let truncated = false;
  let guard = 0;
  while (JSON.stringify(out).length > maxChars && guard++ < 500) {
    const arr = longestArray(out);
    if (arr) {
      arr.pop();
      truncated = true;
      continue;
    }
    // No list left to trim: tighten strings instead.
    const len = JSON.stringify(out).length;
    const nextMax = Math.max(40, Math.floor((maxString * maxChars) / len) - 20);
    if (nextMax >= maxString) break;
    out = deepMap(out, nextMax);
    truncated = true;
  }
  if (truncated && out && typeof out === "object" && !Array.isArray(out)) {
    (out as Record<string, unknown>).gekuerzt = true;
  }
  return out as T;
}

/** Strip markdown/HTML noise from stored rich text for compact previews. */
export function plainText(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
