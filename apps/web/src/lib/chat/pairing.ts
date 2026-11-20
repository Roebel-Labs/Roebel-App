// Device pairing for desktop clients (Ortis Studio). Spec 2026-11-12 §3.1.
//
// start  → desktop gets { code, pollToken }; only sha256(pollToken) is stored.
// approve→ the owner confirms the code (Röbel app session or Ortis ID browser session).
// poll   → desktop trades pollToken for a chat session token exactly once.
//
// Relative imports so `npx tsx --test` resolves them.
import { createHash, randomBytes, randomInt } from "node:crypto";

/** No 0/O, 1/I/L: the code is typed by hand when the QR does not scan. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const PAIRING_TTL_MS = 10 * 60_000;

export function generateCode(rand: (max: number) => number = randomInt): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return out;
}

/** "abcd-efgh", " ABCD EFGH " → "ABCDEFGH"; anything else → null. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.toUpperCase().replace(/[\s-]/g, "");
  if (v.length !== CODE_LENGTH) return null;
  for (const ch of v) if (!CODE_ALPHABET.includes(ch)) return null;
  return v;
}

/** For display: "ABCD-EFGH". */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function newPollToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPollToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isPollToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/.test(raw);
}

/** Device names come from the desktop; keep them short and printable. */
export function cleanDeviceName(raw: unknown): string {
  if (typeof raw !== "string") return "Ortis Studio";
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return v || "Ortis Studio";
}

export type PairingStatus = "pending" | "approved" | "claimed";

export interface PairingRow {
  id: string;
  code: string;
  device_name: string;
  status: PairingStatus;
  wallet: string | null;
  expires_at: string;
}

export type PairingView = "pending" | "approved" | "claimed" | "expired";

export function pairingView(row: Pick<PairingRow, "status" | "expires_at">, nowMs: number): PairingView {
  if (row.status === "claimed") return "claimed";
  if (Date.parse(row.expires_at) <= nowMs) return "expired";
  return row.status;
}

export function approveUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/studio/verbinden?code=${encodeURIComponent(code)}`;
}
