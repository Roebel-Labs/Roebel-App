import { createHmac, randomBytes } from "node:crypto";

// Ticket codes: 10 chars from an alphabet without 0/O/1/I so door staff can read them aloud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAYLOAD_RE = /^roebel-ticket:v1:([A-HJ-NP-Z2-9]{10}):([0-9a-f]{16})$/;

export function generateTicketCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function secret(): string {
  const s = process.env.TICKET_QR_SECRET;
  if (!s || s.length < 32) throw new Error("TICKET_QR_SECRET is not set (need ≥ 32 chars).");
  return s;
}

function mac(code: string): string {
  return createHmac("sha256", secret()).update(`roebel-ticket:v1:${code}`).digest("hex").slice(0, 16);
}

/** QR payload printed in the app: roebel-ticket:v1:<code>:<hmac16>. */
export function ticketQrPayload(code: string): string {
  return `roebel-ticket:v1:${code}:${mac(code)}`;
}

/** Returns the code when the HMAC matches, else null. Cheap rejection before any DB lookup. */
export function parseTicketQrPayload(payload: string): { code: string } | null {
  const m = PAYLOAD_RE.exec(payload.trim());
  if (!m) return null;
  return mac(m[1]) === m[2] ? { code: m[1] } : null;
}
