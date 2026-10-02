// Pure helpers for the "Funder aufladen" admin card: parse a German-style
// amount input into 18-decimal atto units, and map wallet/RPC errors to
// short German messages. No env, no network — unit-tested in
// tests/muenzen-topup.test.ts.

const ATTO_PER_CENT = 10n ** 16n; // 1 Münze = 10^18 atto, amounts limited to 2 decimals

/** Minimum xDAI the funder should keep as gas reserve for payouts. */
export const FUNDER_MIN_XDAI = 0.5;

export type ParsedAmount = { ok: true; atto: bigint } | { ok: false; error: string };

/**
 * Parse a user-typed Münzen amount. Accepts "12", "12,5", "12.50",
 * "1.234,56" (German thousands dots). English "1,234.56" is NOT supported:
 * a single "." or "," is treated as the decimal separator; with both
 * present, "." is the thousands separator.
 */
export function parseMuenzenAmount(input: string, maxAtto?: bigint | null): ParsedAmount {
  let s = input.trim().replace(/\s/g, "");
  if (!s) return { ok: false, error: "Bitte einen Betrag eingeben." };
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: "Ungültiger Betrag." };
  const [whole, frac = ""] = s.split(".");
  if (frac.length > 2) return { ok: false, error: "Höchstens 2 Nachkommastellen." };
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  if (cents <= 0n) return { ok: false, error: "Betrag muss größer als 0 sein." };
  const atto = cents * ATTO_PER_CENT;
  if (maxAtto != null && atto > maxAtto) return { ok: false, error: "Zu wenig Münzen im verbundenen Wallet." };
  return { ok: true, atto };
}

/** Map a thrown wallet / RPC error to a short German message. */
export function topupErrorMessage(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (/reject|denied|cancel|abgebrochen|user closed/.test(msg)) return "Abgebrochen.";
  if (/insufficient|exceeds balance|balance too low|erc1155: insufficient/.test(msg)) return "Zu wenig Münzen im verbundenen Wallet.";
  if (/network|fetch|timeout|rpc|socket|failed to fetch|503|502|429/.test(msg)) return "Netzwerkfehler — bitte erneut versuchen.";
  return "Aufladen fehlgeschlagen. Bitte erneut versuchen.";
}
