// People for the credential register: recipient lists (validation, CSV upload), the per-type
// list an org sees, and the app-user name search.
//
// Privacy: an org sees the state of each invitation it sent. Whether a holder claimed publicly is
// reported only when the chain already shows it (`claimed_onchain`); nothing else about a private
// holder (no wallet, no claim time, no email) leaves this module.
// Relative imports only: loaded by `npx tsx --test`.
import type { Hex } from "viem";
import { isAddress } from "viem";
import type { Deps, Fail, Result } from "./actions";
import type { RecipientInput } from "./batch";
import type { Caller } from "./caller";
import { orgContextFor } from "./rights";
import type { InvitationRow } from "./store";

const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 120;
const MAX_ROWS = 10_000;

// ── recipient lists ───────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Untrusted list → recipients. Items: `{ kind: "account", wallet, displayName? }`,
 * `{ kind: "contact", name, email? }`, or kind-less `{ wallet }` / `{ name, email }` (as
 * parsePeopleCsv returns them, with their CSV line in `row`). Row numbers are 1-based.
 */
export function normaliseRecipients(raw: unknown): { recipients: RecipientInput[]; rejected: { row: number; reason: string }[] } {
  const recipients: RecipientInput[] = [];
  const rejected: { row: number; reason: string }[] = [];
  if (!Array.isArray(raw)) return { recipients, rejected: [{ row: 0, reason: "Keine Liste" }] };
  if (raw.length > MAX_ROWS) return { recipients, rejected: [{ row: 0, reason: `Mehr als ${MAX_ROWS} Zeilen` }] };
  raw.forEach((item, idx) => {
    const o = typeof item === "object" && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
    const row = o && typeof o.row === "number" && Number.isSafeInteger(o.row) ? o.row : idx + 1;
    if (!o) return void rejected.push({ row, reason: "Unbekannter Eintrag" });
    const kind = o.kind ?? (o.wallet !== undefined ? "account" : "contact");
    if (kind === "account") {
      const wallet = str(o.wallet);
      if (!isAddress(wallet, { strict: false })) return void rejected.push({ row, reason: "Ungültiges Konto" });
      const displayName = str(o.displayName).slice(0, MAX_NAME);
      recipients.push(displayName ? { kind: "account", wallet: wallet.toLowerCase(), displayName } : { kind: "account", wallet: wallet.toLowerCase() });
      return;
    }
    if (kind !== "contact") return void rejected.push({ row, reason: "Unbekannter Eintrag" });
    const name = str(o.name).replace(/\s+/g, " ");
    const email = str(o.email);
    if (!name) return void rejected.push({ row, reason: "Name fehlt" });
    if (name.length > MAX_NAME) return void rejected.push({ row, reason: "Name ist zu lang" });
    if (email && (!EMAIL.test(email) || email.length > 254)) return void rejected.push({ row, reason: "Ungültige E-Mail-Adresse" });
    recipients.push(email ? { kind: "contact", name, email: email.toLowerCase() } : { kind: "contact", name });
  });

  // Two contacts with the same name and no email cannot be told apart (one would silently get
  // nothing): refuse every such row and ask for an email.
  const nameOnly = new Map<string, number[]>();
  raw.forEach((item, idx) => {
    const o = typeof item === "object" && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
    if (!o) return;
    const kind = o.kind ?? (o.wallet !== undefined ? "account" : "contact");
    const name = str(o.name).replace(/\s+/g, " ").toLowerCase();
    if (kind !== "contact" || !name || str(o.email)) return;
    const row = typeof o.row === "number" && Number.isSafeInteger(o.row) ? o.row : idx + 1;
    nameOnly.set(name, [...(nameOnly.get(name) ?? []), row]);
  });
  const clashing = new Set<string>([...nameOnly].filter(([, rows]) => rows.length > 1).map(([n]) => n));
  if (clashing.size === 0) return { recipients, rejected };
  for (const [n, rows] of nameOnly) if (clashing.has(n)) for (const row of rows) rejected.push({ row, reason: "Gleicher Name ohne E-Mail — bitte E-Mail ergänzen" });
  rejected.sort((a, b) => a.row - b.row);
  return {
    recipients: recipients.filter((r) => !(r.kind === "contact" && !r.email && clashing.has(r.name.toLowerCase()))),
    rejected,
  };
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const HEADER_CELL = /^(name|vor-? ?und nachname|vorname|nachname|e-?mail|mail|e-?mail-adresse)$/i;

/**
 * A pasted or uploaded list: separator `;` or `,` (taken from the first line), header optional,
 * columns name and e-mail in either order (the e-mail is the cell with an `@`). Returns
 * `{ row, name, email? }` per non-empty line, for normaliseRecipients.
 */
export function parsePeopleCsv(text: string): unknown[] {
  const lines = (typeof text === "string" ? text.replace(/^\uFEFF/, "") : "").split(/\r?\n/);
  const first = lines.find((l) => l.trim() !== "") ?? "";
  const sep = first.includes(";") ? ";" : ",";
  const out: unknown[] = [];
  let headerChecked = false;
  lines.forEach((line, idx) => {
    if (line.trim() === "") return;
    const cells = splitCsvLine(line, sep);
    if (!headerChecked) {
      headerChecked = true;
      if (!cells.some((c) => c.includes("@")) && cells.some((c) => HEADER_CELL.test(c))) return;
    }
    const email = cells.find((c) => c.includes("@")) ?? "";
    // "Vorname;Nachname;E-Mail": every non-email cell is part of the name.
    const name = cells.filter((c) => c !== "" && !c.includes("@")).join(" ");
    out.push(email ? { row: idx + 1, name, email } : { row: idx + 1, name });
  });
  return out;
}

// ── the org's list ────────────────────────────────────────────────────────────

export type PersonState = "eingeladen" | "angenommen" | "abgelehnt" | "widerrufen" | "abgelaufen";
export type PersonView = { id: string; displayName: string; state: PersonState; public: boolean; validUntil: string | null; hasLink: boolean };

async function orgOf(d: Deps, accountId: unknown, wallet: string) {
  if (typeof accountId !== "string") return fail(404, "NOT_FOUND", "Organisation nicht gefunden.");
  const o = await orgContextFor(d.store, accountId, wallet);
  if ("error" in o) {
    return o.error === "FORBIDDEN"
      ? fail(403, "FORBIDDEN", "Dafür brauchst du die Rolle Inhaber:in oder Admin dieser Organisation.")
      : fail(404, "NOT_FOUND", "Organisation nicht gefunden.");
  }
  return o;
}

function stateOf(i: InvitationRow, nowSec: bigint): PersonState {
  if (i.status === "revoked") return "widerrufen";
  if (i.status === "declined") return "abgelehnt";
  const v = BigInt(i.validUntil);
  if (v !== 0n && v < nowSec) return "abgelaufen";
  return i.status === "accepted" ? "angenommen" : "eingeladen";
}

export async function listPeople(d: Deps, c: Caller, p: { accountId: string; typeId: Hex }): Promise<Result<PersonView[]>> {
  if (!p || typeof p.typeId !== "string" || !BYTES32.test(p.typeId)) return fail(400, "BAD_REQUEST", "typeId fehlt.");
  const org = await orgOf(d, p.accountId, c.wallet);
  if ("ok" in org) return org;
  const t = await d.store.getType(p.typeId);
  if (!t || t.accountId !== org.accountId) return fail(404, "NOT_FOUND", "Diesen Ausweis gibt es nicht.");

  // `prepared` rows belong to a batch not yet on chain: nobody has been invited yet.
  const invs = await d.store.listInvitations({ typeId: t.typeId, statuses: ["invited", "accepted", "declined", "revoked"] });
  const unnamed = invs.filter((i) => !i.displayName && i.recipientWallet).map((i) => i.recipientWallet as string);
  const names = new Map((unnamed.length ? await d.store.usersByWallets(unnamed) : []).map((u) => [u.wallet, u.displayName]));
  const nowSec = BigInt(Math.floor(d.now() / 1000));

  const out = invs.map((i): PersonView => {
    const v = BigInt(i.validUntil);
    return {
      id: i.id,
      displayName: i.displayName || (i.recipientWallet && names.get(i.recipientWallet)) || "Ohne Namen",
      state: stateOf(i, nowSec),
      // The chain shows a public claim anyway; a private one stays "angenommen" without more.
      public: i.claimedOnchain === true,
      validUntil: v === 0n ? null : new Date(Number(v) * 1000).toISOString(),
      hasLink: i.status === "invited" && i.leafKind === "claim_key" && i.tokenEnc !== null && i.recipientWallet === null,
    };
  });
  out.sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
  return { ok: true, data: out };
}

// ── app-user search ───────────────────────────────────────────────────────────

export const PEOPLE_SEARCH_LIMIT = 20;

/** App users by display name (as the member invite screen searches), at most 20. */
export async function searchPeople(
  d: Deps,
  c: Caller,
  p: { accountId: string; query: string },
): Promise<Result<{ wallet: string; displayName: string; avatarUrl: string | null }[]>> {
  const org = await orgOf(d, p?.accountId, c.wallet);
  if ("ok" in org) return org;
  const q = typeof p.query === "string" ? p.query.trim().slice(0, 50) : "";
  if (q.length < 2) return { ok: true, data: [] };
  const users = await d.store.searchUsers(q, PEOPLE_SEARCH_LIMIT);
  return {
    ok: true,
    data: users.slice(0, PEOPLE_SEARCH_LIMIT).map((u) => ({ wallet: u.wallet, displayName: u.displayName, avatarUrl: u.avatarUrl })),
  };
}
