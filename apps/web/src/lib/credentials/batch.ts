// Batch builder: a list of people becomes one Merkle batch of the register. App users get an
// `Account` leaf (subject = their wallet); people without the app get a `ClaimKey` leaf for a
// fresh one-time key, a sealed copy of that key and a link token (only its hash is searchable).
// Only the root and the count go on chain (one addBatch step); salts, proofs and sealed secrets
// stay in the mirror. Steps and summaries never carry a name, an email or an address.
//
// Also prepares revocations of leaves or whole batches that are on chain.
// Relative imports only: loaded by `npx tsx --test`.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { buildTree, leafHash, MAX_STEPS, type RegisterStep } from "@netizen-labs/credential-registry";
import { bytesToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prepareAction, viaOf, type Deps, type Fail, type Result } from "./actions";
import type { Caller } from "./caller";
import { normaliseRecipients } from "./people";
import { chainReadiness, needsPrivateOnlyStep, orgContextFor, type OrgContext } from "./rights";
import { sealSecret } from "./secrets";
import type { ActionStatus, BatchRow, BatchSource, InvitationRow, NewInvitation, TypeRow } from "./store";

export type RecipientInput =
  | { kind: "account"; wallet: string; displayName?: string }
  | { kind: "contact"; name: string; email?: string };

export const MAX_BATCH_RECIPIENTS = 2000;
/** Leaves per revokeLeaves step (gas per transaction stays well below the block limit). */
export const REVOKE_LEAVES_PER_STEP = 200;

export type BuiltBatch = { root: Hex; count: number; invitations: NewInvitation[]; plainTokens: Map<string /* invitation id */, string> };

export class BatchInputError extends Error {}

/** secp256k1 group order: a private key must be in [1, n-1]. */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const uuidFrom = (b: Uint8Array): string => {
  const x = Uint8Array.from(b.subarray(0, 16));
  x[6] = (x[6] & 0x0f) | 0x40;
  x[8] = (x[8] & 0x3f) | 0x80;
  const h = Buffer.from(x).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

function claimKey(rand: (bytes: number) => Uint8Array): Hex {
  for (;;) {
    const k = bytesToHex(rand(32));
    const n = BigInt(k);
    if (n > 0n && n < SECP256K1_N) return k;
  }
}

const normName = (s: string) => s.trim().replace(/\s+/g, " ");

/** Who a recipient is, for duplicates: the wallet, else the email, else the name. */
export function recipientKey(r: RecipientInput): string {
  if (r.kind === "account") return `w:${r.wallet.toLowerCase()}`;
  if (r.email) return `e:${r.email.trim().toLowerCase()}`;
  return `n:${normName(r.name).toLowerCase()}`;
}

/**
 * Pure: builds leaves, tree and invitation rows. `seal(plain, context)` must bind the ciphertext
 * to its row; the contexts are `invitation:<id>:claim_key` and `invitation:<id>:token`.
 */
export function buildBatch(p: {
  typeId: Hex;
  recipients: readonly RecipientInput[];
  validUntil: bigint;
  rand: (bytes: number) => Uint8Array;
  seal: (plain: string, context: string) => string;
}): BuiltBatch {
  if (p.recipients.length > MAX_BATCH_RECIPIENTS * 4) throw new BatchInputError("too many recipients");
  const seen = new Set<string>();
  const unique: RecipientInput[] = [];
  for (const r of p.recipients) {
    const k = recipientKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(r);
  }
  if (unique.length === 0) throw new BatchInputError("no recipients");
  if (unique.length > MAX_BATCH_RECIPIENTS) throw new BatchInputError(`more than ${MAX_BATCH_RECIPIENTS} recipients`);

  const typeId = p.typeId.toLowerCase() as Hex;
  const validUntil = p.validUntil;
  const plainTokens = new Map<string, string>();
  const rows: Omit<NewInvitation, "proof">[] = [];

  for (const r of unique) {
    const id = uuidFrom(p.rand(16));
    const salt = bytesToHex(p.rand(32));
    if (r.kind === "account") {
      const subject = r.wallet.toLowerCase() as Address;
      rows.push({
        id, typeId, leafKind: "account", subject, validUntil: validUntil.toString(), salt,
        leafHash: leafHash({ kind: "account", typeId, subject, validUntil, salt }).toLowerCase() as Hex,
        claimKeyEnc: null, tokenHash: null, tokenEnc: null,
        recipientWallet: subject, displayName: r.displayName ? normName(r.displayName) : null, contactEmail: null,
        status: "prepared",
      });
    } else {
      const key = claimKey(p.rand);
      const subject = privateKeyToAccount(key).address.toLowerCase() as Address;
      const token = Buffer.from(p.rand(32)).toString("base64url");
      plainTokens.set(id, token);
      rows.push({
        id, typeId, leafKind: "claim_key", subject, validUntil: validUntil.toString(), salt,
        leafHash: leafHash({ kind: "claimKey", typeId, subject, validUntil, salt }).toLowerCase() as Hex,
        claimKeyEnc: p.seal(key, `invitation:${id}:claim_key`),
        tokenHash: createHash("sha256").update(token).digest("hex"),
        tokenEnc: p.seal(token, `invitation:${id}:token`),
        recipientWallet: null, displayName: normName(r.name), contactEmail: r.email ? r.email.trim().toLowerCase() : null,
        status: "prepared",
      });
    }
  }

  const tree = buildTree(rows.map((r) => r.leafHash));
  const invitations: NewInvitation[] = rows.map((r) => ({ ...r, proof: tree.proofOf(r.leafHash).map((h) => h.toLowerCase() as Hex) }));
  return { root: tree.root.toLowerCase() as Hex, count: invitations.length, invitations, plainTokens };
}

// ── shared helpers ────────────────────────────────────────────────────────────

const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
const bad = (message: string) => fail(400, "BAD_REQUEST", message);
const isFail = (v: unknown): v is Fail => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

async function readyOrg(d: Deps, accountId: unknown, wallet: string): Promise<OrgContext | Fail> {
  if (typeof accountId !== "string") return fail(404, "NOT_FOUND", "Organisation nicht gefunden.");
  const o = await orgContextFor(d.store, accountId, wallet);
  if ("error" in o) {
    return o.error === "FORBIDDEN"
      ? fail(403, "FORBIDDEN", "Dafür brauchst du die Rolle Inhaber:in oder Admin dieser Organisation.")
      : fail(404, "NOT_FOUND", "Organisation nicht gefunden.");
  }
  const r = await chainReadiness(d.reader, o, wallet as Address);
  if (r === "org_not_registered") return fail(409, "ORG_NOT_ON_CHAIN", "Diese Organisation ist noch nicht im öffentlichen Register eingetragen.");
  if (r === "no_chain_authority") {
    return fail(
      409,
      "NO_CHAIN_AUTHORITY",
      "Dein Konto ist für diese Organisation noch nicht im Register berechtigt. Öffne in der App Organisation → Einstellungen → Onchain-Organisation und gleiche die Rollen ab.",
    );
  }
  return o;
}

const TYPE_NOT_FOUND = fail(404, "NOT_FOUND", "Diesen Ausweis gibt es nicht.");

/**
 * "YYYY-MM-DD" → the last second of that day in Europe/Berlin, as unix seconds. null when not a
 * real calendar date.
 */
export function endOfDayBerlin(date: string): bigint | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const guess = Date.UTC(y, mo - 1, d, 23, 59, 59);
  const check = new Date(guess);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  // Berlin's UTC offset at that moment (DST switches happen at 01:00 UTC, never near 23:59 local).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(check)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return BigInt((guess - (wall - guess)) / 1000);
}

const formatDay = (unix: bigint) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(Number(unix) * 1000));

/** Invitation is still a live claim of this person (so a new batch would duplicate it). */
const LIVE_STATUSES: readonly InvitationRow["status"][] = ["prepared", "invited", "accepted"];
const PENDING_ACTION: readonly ActionStatus[] = ["awaiting_confirmation", "submitted"];

function existingKey(i: InvitationRow): string[] {
  const keys: string[] = [];
  if (i.recipientWallet) keys.push(`w:${i.recipientWallet}`);
  if (i.leafKind === "account") keys.push(`w:${i.subject}`);
  if (i.contactEmail) keys.push(`e:${i.contactEmail.toLowerCase()}`);
  else if (i.leafKind === "claim_key" && i.displayName) keys.push(`n:${normName(i.displayName).toLowerCase()}`);
  return keys;
}

/**
 * Keys of people who already hold a live invitation for the type that lasts at least until
 * `validUntil` (0 = forever). `prepared` invitations count only while their batch is still
 * prepared and its action still pending (an expired or failed action frees them).
 */
async function livePeople(d: Deps, typeId: Hex, validUntil: bigint): Promise<Set<string>> {
  const invs = await d.store.listInvitations({ typeId, statuses: LIVE_STATUSES });
  const batches = new Map<string, BatchRow | null>();
  const actionLive = new Map<string, boolean>();
  const live = new Set<string>();
  for (const i of invs) {
    const v = BigInt(i.validUntil);
    const lastsLongEnough = v === 0n || (validUntil !== 0n && v >= validUntil);
    if (!lastsLongEnough) continue;
    if (!batches.has(i.batchId)) batches.set(i.batchId, await d.store.getBatch(i.batchId));
    const b = batches.get(i.batchId);
    if (!b || b.status === "cancelled" || b.status === "revoked") continue;
    if (i.status === "prepared") {
      if (b.status !== "prepared" || !b.actionId) continue;
      if (!actionLive.has(b.actionId)) {
        const a = await d.store.getAction(b.actionId);
        actionLive.set(b.actionId, !!a && PENDING_ACTION.includes(a.status) && Date.parse(a.expiresAt) > d.now());
      }
      if (!actionLive.get(b.actionId)) continue;
    } else if (b.status !== "onchain") {
      continue;
    }
    for (const k of existingKey(i)) live.add(k);
  }
  return live;
}

// ── prepare a batch ───────────────────────────────────────────────────────────

export async function prepareBatch(
  d: Deps,
  c: Caller,
  p: {
    accountId: string;
    typeId: Hex;
    recipients?: RecipientInput[];
    fromMemberList?: boolean;
    /** ISO date, end of that day Europe/Berlin. Absent: the type's default validity, else none. */
    validUntil?: string;
    source?: "people" | "member_list" | "event";
  },
): Promise<Result<{ actionId: string; batchId: string; counts: { app: number; link: number; skipped: number } }>> {
  if (!p || typeof p.typeId !== "string" || !BYTES32.test(p.typeId)) return bad("typeId fehlt.");
  if (p.recipients !== undefined && !Array.isArray(p.recipients)) return bad("Die Liste der Personen ist ungültig.");
  if (p.source !== undefined && !["people", "member_list", "event"].includes(p.source)) return bad("Unbekannte Quelle.");

  const { recipients: given, rejected } = normaliseRecipients(p.recipients ?? []);
  if (rejected.length > 0) {
    const rows = rejected.slice(0, 5).map((r) => `Zeile ${r.row}: ${r.reason}`).join("; ");
    return fail(400, "REJECTED_ROWS", `Einige Einträge sind ungültig (${rows}${rejected.length > 5 ? " …" : ""}).`);
  }

  let validUntil = 0n;
  const typeIdLc = p.typeId.toLowerCase() as Hex;

  const org = await readyOrg(d, p.accountId, c.wallet);
  if (isFail(org)) return org;
  const t = await d.store.getType(typeIdLc);
  if (!t || t.accountId !== org.accountId) return TYPE_NOT_FOUND;
  if (t.chainStatus !== "onchain") return fail(409, "TYPE_NOT_ON_CHAIN", "Dieser Ausweis ist noch nicht im Register.");
  if (t.retired) return fail(409, "TYPE_RETIRED", "Dieser Ausweis wird nicht mehr ausgegeben.");
  if (t.policy !== "issuer_batch" || !t.kind) return fail(409, "NOT_ISSUABLE", "Dieser Ausweis wird nicht über Listen vergeben.");

  const nowSec = BigInt(Math.floor(d.now() / 1000));
  if (p.validUntil !== undefined && p.validUntil !== null && p.validUntil !== "") {
    const v = typeof p.validUntil === "string" ? endOfDayBerlin(p.validUntil) : null;
    if (v === null) return bad("Ungültiges Datum für „gültig bis“.");
    if (v <= nowSec) return bad("„Gültig bis“ muss in der Zukunft liegen.");
    validUntil = v;
  } else if (t.defaultValiditySeconds > 0) {
    validUntil = nowSec + BigInt(t.defaultValiditySeconds);
  }

  const all: RecipientInput[] = [...given];
  if (p.fromMemberList) {
    for (const o of await d.store.ownersOf(org.accountId)) all.push({ kind: "account", wallet: o.wallet });
  }
  // Duplicates within the call collapse here too (buildBatch does it again), so `skipped` counts people.
  const unique = new Map<string, RecipientInput>();
  for (const r of all) if (!unique.has(recipientKey(r))) unique.set(recipientKey(r), r);
  if (unique.size === 0) return bad("Die Liste ist leer.");
  if (unique.size > MAX_BATCH_RECIPIENTS) return bad(`Höchstens ${MAX_BATCH_RECIPIENTS} Personen auf einmal.`);

  const live = await livePeople(d, typeIdLc, validUntil);
  const included = [...unique.entries()].filter(([k]) => !live.has(k)).map(([, r]) => r);
  const skipped = unique.size - included.length;
  if (included.length === 0) {
    return fail(409, "NOTHING_TO_ISSUE", "Alle ausgewählten Personen haben schon eine gültige Einladung für diesen Ausweis.");
  }

  const built = buildBatch({
    typeId: typeIdLc,
    recipients: included,
    validUntil,
    rand: (n) => new Uint8Array(randomBytes(n)),
    seal: (plain, context) => sealSecret(plain, context),
  });
  const counts = {
    app: built.invitations.filter((i) => i.leafKind === "account").length,
    link: built.invitations.filter((i) => i.leafKind === "claim_key").length,
    skipped,
  };

  const batchId = randomUUID();
  const source: BatchSource = p.source ?? (p.fromMemberList && given.length === 0 ? "member_list" : "people");
  await d.store.insertBatchWithInvitations({ id: batchId, actionId: null, typeId: typeIdLc, root: built.root, count: built.count, source }, built.invitations);

  const steps: RegisterStep[] = [];
  if (t.kind === "membership" && needsPrivateOnlyStep(org, await d.reader.orgPrivateOnly(org.orgId))) {
    steps.push({ fn: "setOrgPrivateOnly", orgId: org.orgId, privateOnly: true });
  }
  steps.push({ fn: "addBatch", typeId: typeIdLc, root: built.root, count: built.count });

  const n = built.count;
  const title = t.kind === "badge" ? `${n} Abzeichen vergeben: ${t.name}` : `${n} ${n === 1 ? "Ausweis" : "Ausweise"} ausstellen: ${t.name}`;
  const lines = [
    validUntil === 0n ? "Unbefristet gültig" : `Gültig bis ${formatDay(validUntil)}`,
    `${counts.app} in der App, ${counts.link} per Link`,
  ];
  if (skipped > 0) lines.push(`${skipped} übersprungen (haben schon eine gültige Einladung)`);
  if (steps.length > 1) lines.push("Mitglieder dieser Organisation sind nur privat sichtbar.");

  try {
    const { actionId } = await prepareAction(d, {
      org,
      wallet: c.wallet,
      via: viaOf(c, c.payload?.client),
      steps,
      summary: { title, lines, orgName: org.name, counts: { app: counts.app, link: counts.link } },
      batchIds: [batchId],
    });
    return { ok: true, data: { actionId, batchId, counts } };
  } catch (e) {
    // Frees the root and the people again.
    await d.store.updateBatch(batchId, { status: "cancelled" }, ["prepared"]).catch(() => false);
    throw e;
  }
}

// ── prepare a revocation ──────────────────────────────────────────────────────

export async function prepareRevocation(
  d: Deps,
  c: Caller,
  p: { accountId: string; invitationIds?: string[]; batchId?: string },
): Promise<Result<{ actionId: string }>> {
  if (!p) return bad("Nichts zum Widerrufen angegeben.");
  const hasIds = Array.isArray(p.invitationIds) && p.invitationIds.length > 0;
  const hasBatch = typeof p.batchId === "string";
  if (hasIds === hasBatch) return bad("Gib entweder einzelne Einladungen oder eine ganze Liste an.");
  if (hasIds && p.invitationIds!.some((id) => typeof id !== "string" || !UUID.test(id))) return bad("Ungültige Einladung.");
  if (hasBatch && !UUID.test(p.batchId!)) return bad("Ungültige Liste.");
  if (hasIds && p.invitationIds!.length > REVOKE_LEAVES_PER_STEP * MAX_STEPS) return bad("Zu viele Einladungen auf einmal.");

  const org = await readyOrg(d, p.accountId, c.wallet);
  if (isFail(org)) return org;

  let batch: BatchRow | null;
  let invitations: InvitationRow[] = [];
  if (hasIds) {
    const ids = [...new Set(p.invitationIds!)];
    for (const id of ids) {
      const i = await d.store.getInvitation(id);
      if (!i) return fail(404, "NOT_FOUND", "Diese Einladung gibt es nicht.");
      invitations.push(i);
    }
    const batchIds = new Set(invitations.map((i) => i.batchId));
    if (batchIds.size !== 1) return bad("Alle Einladungen müssen aus derselben Liste stammen.");
    batch = await d.store.getBatch([...batchIds][0]);
  } else {
    batch = await d.store.getBatch(p.batchId!);
  }
  if (!batch) return fail(404, "NOT_FOUND", "Diese Liste gibt es nicht.");
  const t: TypeRow | null = await d.store.getType(batch.typeId);
  // Another org's batch reads as unknown, never as "forbidden".
  if (!t || t.accountId !== org.accountId) return fail(404, "NOT_FOUND", "Diese Liste gibt es nicht.");
  if (batch.status !== "onchain" || !batch.chainBatchId) return fail(409, "BATCH_NOT_ON_CHAIN", "Diese Liste ist (noch) nicht im Register.");

  let steps: RegisterStep[];
  let title: string;
  if (hasIds) {
    const leaves = invitations.filter((i) => i.status !== "revoked").map((i) => i.leafHash.toLowerCase() as Hex);
    if (leaves.length === 0) return fail(409, "NOTHING_TO_REVOKE", "Diese Einladungen sind schon widerrufen.");
    steps = [];
    for (let i = 0; i < leaves.length; i += REVOKE_LEAVES_PER_STEP) {
      steps.push({ fn: "revokeLeaves", batchId: batch.chainBatchId, leaves: leaves.slice(i, i + REVOKE_LEAVES_PER_STEP) });
    }
    title = `${leaves.length} ${leaves.length === 1 ? "Ausweis" : "Ausweise"} widerrufen: ${t.name}`;
  } else {
    steps = [{ fn: "revokeBatch", batchId: batch.chainBatchId }];
    title = `Ganze Liste widerrufen: ${t.name} (${batch.count})`;
  }

  const { actionId } = await prepareAction(d, {
    org,
    wallet: c.wallet,
    via: viaOf(c, c.payload?.client),
    steps,
    summary: { title, lines: ["Widerrufene Ausweise sind sofort ungültig."], orgName: org.name },
  });
  return { ok: true, data: { actionId } };
}
