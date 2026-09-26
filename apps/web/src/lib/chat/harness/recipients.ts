// Recipient resolution for gated actions (DMs, Röbel Münzen transfers): a
// username or display name → exactly one app user, server-side. Exact,
// case-insensitive matches only; several matches → ToolInputError asking for
// the exact @username. Wallet addresses never appear in messages.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ToolInputError } from "./errors";

export interface RecipientRow {
  wallet_address: string | null;
  username: string | null;
  display_name: string | null;
}

export interface ResolvedRecipient {
  wallet: string;           // lower-case; server-side only
  name: string;             // display name (or @username) for cards
  username: string | null;
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

/** Normalises what the model passed: trims, drops a leading "@", collapses spaces. */
export function normalizeRecipientQuery(raw: string): string {
  return raw.trim().replace(/^@+/, "").replace(/\s+/g, " ");
}

function label(r: RecipientRow): string {
  const dn = r.display_name?.trim();
  const un = r.username?.trim();
  if (dn && un) return `${dn} (@${un})`;
  return dn || (un ? `@${un}` : "Unbekannt");
}

/**
 * Pure choice among candidate rows. Username matches win over display-name
 * matches; self is excluded; rows without a valid wallet are ignored.
 */
export function pickRecipient(rows: RecipientRow[], rawQuery: string, selfWallet: string): ResolvedRecipient {
  const query = normalizeRecipientQuery(rawQuery);
  if (!query) throw new ToolInputError("Bitte nenne den Empfänger mit Benutzernamen oder Anzeigenamen.");
  if (WALLET_RE.test(query)) {
    throw new ToolInputError("Bitte nenne den Empfänger mit Benutzernamen oder Anzeigenamen, nicht mit einer Adresse.");
  }
  const q = query.toLowerCase();
  const self = selfWallet.toLowerCase();
  const seen = new Set<string>();
  const valid = rows.filter((r) => {
    const w = r.wallet_address?.toLowerCase() ?? "";
    if (!WALLET_RE.test(w) || seen.has(w)) return false;
    seen.add(w);
    return true;
  });
  const byUsername = valid.filter((r) => r.username?.trim().toLowerCase() === q);
  const byName = valid.filter((r) => r.display_name?.trim().replace(/\s+/g, " ").toLowerCase() === q);
  const matches = byUsername.length ? byUsername : byName;
  const others = matches.filter((r) => r.wallet_address!.toLowerCase() !== self);
  if (!others.length) {
    if (matches.length) throw new ToolInputError("Das bist du selbst. Bitte nenne eine andere Person.");
    throw new ToolInputError(`Niemand mit dem Namen „${query}“ gefunden. Bitte frag nach dem genauen Benutzernamen.`);
  }
  if (others.length > 1) {
    const names = others.slice(0, 5).map(label).join(", ");
    throw new ToolInputError(
      `Mehrere Personen heißen „${query}“: ${names}. Frag den Menschen, wen genau er meint, und nutze den exakten @Benutzernamen.`,
    );
  }
  const r = others[0];
  return {
    wallet: r.wallet_address!.toLowerCase(),
    name: r.display_name?.trim() || (r.username?.trim() ? `@${r.username.trim()}` : "Unbekannt"),
    username: r.username?.trim() || null,
  };
}

/** Escapes LIKE wildcards so ilike behaves as a case-insensitive equality. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Loads candidates (exact username / display name, case-insensitive) and picks one. */
export async function resolveRecipient(db: SupabaseClient, rawQuery: string, selfWallet: string): Promise<ResolvedRecipient> {
  const query = normalizeRecipientQuery(rawQuery);
  if (!query || WALLET_RE.test(query)) return pickRecipient([], rawQuery, selfWallet);
  const pattern = escapeLike(query);
  const cols = "wallet_address, username, display_name";
  const [byUser, byName] = await Promise.all([
    db.from("users").select(cols).ilike("username", pattern).limit(10),
    db.from("users").select(cols).ilike("display_name", pattern).limit(10),
  ]);
  if (byUser.error || byName.error) {
    throw new Error(`[harness/recipients] lookup: ${(byUser.error ?? byName.error)!.message}`);
  }
  return pickRecipient([...(byUser.data as RecipientRow[]), ...(byName.data as RecipientRow[])], rawQuery, selfWallet);
}
