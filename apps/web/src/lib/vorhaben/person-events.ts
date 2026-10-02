// NSP-13 Stage 2: a person-signed kind-2101 Nostr event IS the API request for a Vorhaben action.
// Spec: docs/superpowers/specs/2026-10-02-nostr-sovereignty-roadmap-design.md (Stage 2).
//
// The event replaces the roebel-vorhaben-v1 wallet signature: its pubkey resolves to a wallet through the
// identity bridge (nostr_identities, not revoked). Authorization stays with the existing rules
// (handleVorhabenAction / submitTallyConfirmation) — they run with that wallet. On top, the event must
// describe exactly what the rules will record (object, proposal, action, role, from/to, content, seq), so the
// publisher can relay it verbatim instead of signing its own.
//
// Seq race: the seq is checked against next_outbox_seq BEFORE the action; the DB trigger assigns the real seq
// when the outbox row is inserted. If another action on the same object slipped in between, the row's seq
// differs and the row stays town-signed (personSigned: false). The action itself is never failed for that.
import { verifyEvent, type NostrEvent } from "@netizen-labs/nostr";
import {
  PERSON_ACTION_ROLES, headAddress, isTrustedAction, payloadHash, pollAddress, safeParseAction, taskAddress,
  type ParsedAction,
} from "@netizen-labs/protocol";
import type { VorhabenAction } from "../signed-request/message";

type Fail = { ok: false; status: number; code: string; message: string; next?: number };
export type PersonEventResult = { ok: true; data: Record<string, unknown> } | Fail;
type ActionResult = { ok: true; data: unknown } | { ok: false; status: number; code: string; message: string };

export type OutboxObjectType = "task" | "tally";

export interface PersonTaskInfo {
  proposalUuid: string;
  /** proposals.proposal_id — the key the NSP-12 head is published under. */
  proposalKey: string;
  proposer: string;
  status: string;
  assignee: string | null;
}

export interface OutboxMatch {
  id: number;
  seq: number;
  actorWallet: string | null;
  actorRole: string;
  fromStatus: string | null;
  toStatus: string;
  extra: Record<string, unknown>;
}

export interface PersonEventDeps {
  /** VORHABEN_TOWN_PUBKEY (64-hex). Missing → the feature is off (503). */
  townPubkey: string | undefined;
  nowSec: () => number;
  /** Lowercase wallet of the live (revoked_at is null) binding for this pubkey, else null. */
  walletForPubkey: (pubkey: string) => Promise<string | null>;
  /** pubkey_hex of the live binding for this wallet, else null. */
  pubkeyForWallet: (wallet: string) => Promise<string | null>;
  getTask: (taskId: string) => Promise<PersonTaskInfo | null>;
  getProposal: (proposalUuid: string) => Promise<{ proposalKey: string; proposer: string } | null>;
  isAttester: (wallet: string) => Promise<boolean>;
  /** True when nostr_outbox already holds a row with event_id = id (a resubmitted event). */
  eventKnown: (eventId: string) => Promise<boolean>;
  /** public.next_outbox_seq(object_type, object_id). */
  nextSeq: (objectType: OutboxObjectType, objectId: string) => Promise<number>;
  /** handleVorhabenAction with the production deps (the unchanged rules). */
  runTaskAction: (wallet: string, action: VorhabenAction, payload: Record<string, unknown>) => Promise<ActionResult>;
  /** submitTallyConfirmation with the production deps (verifies the wallet signature itself). */
  runTallyConfirm: (proposalUuid: string, wallet: string, signature: string) => Promise<{ ok: true; lineIds: string[] } | ActionResult>;
  /** Newest outbox row for (object_type, object_id, action) whose signed_event is null. */
  findOutboxRow: (objectType: OutboxObjectType, objectId: string, action: string) => Promise<OutboxMatch | null>;
  /**
   * Conditional update: { signed_event: event, event_id, person_signed: true } WHERE id AND seq AND
   * signed_event IS NULL AND published_at IS NULL. True when a row was updated.
   */
  attachEvent: (rowId: number, seq: number, event: NostrEvent) => Promise<boolean>;
  log: (message: string) => void;
}

/** API action → the NSP-13 action it produces. Applications (task_apply/task_withdraw) are private (Stage 3). */
export const PERSON_SIGNED_ACTIONS: Readonly<Partial<Record<VorhabenAction, string>>> = {
  task_create: "task_created", task_assign: "task_assigned", task_start: "task_started", task_proof: "proof_added",
  task_submit: "task_submitted", task_approve: "task_approved", task_request_changes: "changes_requested",
  task_cancel: "task_cancelled",
};

/** The status each action moves the task to (task-machine). proof_added always lands in in_arbeit. */
const TARGET_STATUS: Record<string, string> = {
  task_created: "offen", task_assigned: "vergeben", task_started: "in_arbeit", proof_added: "in_arbeit",
  task_submitted: "eingereicht", task_approved: "abgenommen", changes_requested: "in_arbeit", task_cancelled: "abgebrochen",
  tally_confirmed: "bestaetigt",
};

/** Parity with the publisher's free-text policy (packages/publisher/src/vorhaben.ts DEFAULT_CONTENT). */
const DEFAULT_CONTENT: Record<string, string> = {
  task_created: "Aufgabe angelegt.",
  task_assigned: "Aufgabe vergeben.",
  task_started: "Aufgabe gestartet.",
  proof_added: "Nachweis hinzugefügt.",
  task_submitted: "Zur Abnahme eingereicht.",
  task_approved: "Aufgabe abgenommen.",
  changes_requested: "Änderungen angefordert.",
  task_cancelled: "Aufgabe abgebrochen.",
  tally_confirmed: "Wahlhelfer:in bestätigt das Bürgervotum.",
};
const PUBLIC_REASON_ACTIONS = new Set(["changes_requested", "task_cancelled"]);

const BASE_TAGS = new Set(["a", "action", "from", "to", "p", "role", "seq", "occurred_at", "payload_hash"]);
const EXTRA_TAGS: Record<string, string[]> = {
  proof_added: ["url", "tx"],
  tally_confirmed: ["signed_text", "signature", "signer_account", "result_hash", "chain"],
};

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENT_BYTES = 65536;
/** Max distance of created_at / occurred_at from server time. */
const OCCURRED_SKEW_SEC = 600;

const fail = (status: number, code: string, message: string, next?: number): Fail =>
  ({ ok: false, status, code, message, ...(next !== undefined ? { next } : {}) });
const bad = (code: string, message: string) => fail(400, code, message);
const tagValue = (ev: { tags: string[][] }, name: string) => ev.tags.find((t) => t[0] === name)?.[1];
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

/**
 * Relay-acceptable shape only: a stored person event that the relay rejects would block the object's record.
 * Returns a rebuilt canonical event (never the raw request object, so no extra fields reach nostr_outbox).
 */
function canonicalEvent(v: unknown): NostrEvent | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (typeof e.id !== "string" || !HEX64.test(e.id)) return null;
  if (typeof e.pubkey !== "string" || !HEX64.test(e.pubkey)) return null;
  if (typeof e.sig !== "string" || !HEX128.test(e.sig)) return null;
  if (typeof e.content !== "string" || typeof e.kind !== "number" || !Number.isSafeInteger(e.kind)) return null;
  if (typeof e.created_at !== "number" || !Number.isSafeInteger(e.created_at)) return null;
  if (!Array.isArray(e.tags) || !e.tags.every((t) => Array.isArray(t) && t.length > 0 && t.every((x) => typeof x === "string"))) return null;
  return {
    id: e.id, pubkey: e.pubkey, created_at: e.created_at, kind: e.kind,
    tags: (e.tags as string[][]).map((t) => [...t]), content: e.content, sig: e.sig,
  };
}

/** Parses a published object address: a task (32108) or a poll (32104) under the town key. */
export function parseObjectAddress(address: string, townPubkey: string):
  { type: "task"; taskId: string } | { type: "poll"; proposalKey: string } | null {
  const m = /^(\d+):([0-9a-f]{64}):(task|poll):(.+)$/.exec(address);
  if (!m || m[2] !== townPubkey) return null;
  if (m[3] === "task" && m[1] === "32108") {
    const id = uuid(m[4]);
    return id && taskAddress(townPubkey, id) === address ? { type: "task", taskId: id } : null;
  }
  if (m[3] === "poll" && pollAddress(townPubkey, m[4]) === address) return { type: "poll", proposalKey: m[4] };
  return null;
}

/** Url/tx tags the publisher would emit for a proof's attachments, as sorted JSON strings. */
function expectedProofTags(attachments: unknown): string[] {
  if (!Array.isArray(attachments)) return [];
  const out: string[] = [];
  for (const a of attachments as Array<Record<string, unknown>>) {
    const type = a?.type;
    if ((type === "image" || type === "pdf") && typeof a.url === "string" && /^https?:\/\//.test(a.url)) out.push(JSON.stringify(["url", a.url, type]));
    else if (type === "tx" && typeof a.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(a.hash.trim())) out.push(JSON.stringify(["tx", a.hash.trim().toLowerCase()]));
  }
  return out.sort();
}

interface Expect {
  objectType: OutboxObjectType;
  objectId: string;
  objectAddress: string;
  proposalKey: string;
  action: string;
  role: string;
  /** null = the event must not carry a from tag. */
  from: string | null;
  content: string;
}

interface Checked { event: NostrEvent; parsed: ParsedAction; wallet: string; town: string }

/**
 * Steps 1–3: town key, event shape/size, schnorr signature, 2101 grammar, binding.
 * `claimedWallet` (optional body.wallet): the account the app is logged in with. The device key is not cleared on
 * logout, so after an account switch it may still be bound to the previous wallet — never act as that one.
 */
async function verifyBase(deps: PersonEventDeps, raw: unknown, claimedWallet?: unknown): Promise<Checked | Fail> {
  const town = (deps.townPubkey ?? "").trim().toLowerCase();
  if (!HEX64.test(town)) return fail(503, "FEATURE_OFF", "Signierte Nostr-Aktionen sind auf diesem Server nicht eingerichtet (VORHABEN_TOWN_PUBKEY fehlt).");
  const event = canonicalEvent(raw);
  if (!event) return bad("BAD_EVENT", "Das Ereignis fehlt, ist unvollständig oder nicht in Kleinbuchstaben-Hex kodiert.");
  if (new TextEncoder().encode(JSON.stringify(event)).length > MAX_EVENT_BYTES) return bad("EVENT_TOO_LARGE", "Das Ereignis ist zu groß.");
  if (!verifyEvent(event)) return fail(401, "BAD_EVENT_SIGNATURE", "Die Signatur des Ereignisses ist ungültig.");
  if (Math.abs(event.created_at - deps.nowSec()) > OCCURRED_SKEW_SEC) return bad("STALE_EVENT", "Der Zeitstempel des Ereignisses weicht zu stark ab.");
  const parsed = safeParseAction(event);
  if (!parsed.ok) {
    deps.log(`vorhaben/events: event ${event.id} rejected by safeParseAction: ${parsed.error}`);
    return bad("BAD_EVENT", "Das Ereignis ist keine gültige Vorhaben-Aktion.");
  }
  if (event.tags.filter((t) => t[0] === "a").length !== 2) return bad("TAG_NOT_ALLOWED", "Nur das Objekt- und das Vorschlags-a-Tag sind erlaubt.");
  if (event.tags.some((t) => t[0] === "p" && !HEX64.test(t[1] ?? ""))) return bad("BAD_ACTOR", "p-Tags müssen 64-stellige Hex-Schlüssel sein.");
  if (await deps.eventKnown(event.id)) return fail(409, "DUPLICATE", "Dieses Ereignis wurde bereits übermittelt.");
  const wallet = (await deps.walletForPubkey(event.pubkey))?.toLowerCase() ?? null;
  if (!wallet) return fail(401, "NOT_BOUND", "Dieser Nostr-Schlüssel ist mit keinem aktiven Konto verbunden.");
  if (typeof claimedWallet === "string" && claimedWallet.trim().toLowerCase() !== wallet) {
    return fail(409, "WALLET_MISMATCH", "Der Nostr-Schlüssel auf diesem Gerät gehört zu einem anderen Konto.");
  }
  return { event, parsed: parsed.value, wallet, town };
}

/** Everything the event claims, compared against what the rules will record. Runs BEFORE the action. */
async function checkClaims(deps: PersonEventDeps, c: Checked, x: Expect, payload: Record<string, unknown>): Promise<Fail | null> {
  const { event, parsed, town } = c;
  if (tagValue(event, "payload_hash") !== payloadHash(payload)) return bad("PAYLOAD_MISMATCH", "Das Ereignis passt nicht zu den gesendeten Daten (payload_hash).");
  if (parsed.action !== x.action) return bad("ACTION_MISMATCH", `Das Ereignis beschreibt ${parsed.action}, erwartet ist ${x.action}.`);
  const allowedTags = new Set([...BASE_TAGS, ...(EXTRA_TAGS[x.action] ?? [])]);
  const unknown = event.tags.find((t) => !allowedTags.has(t[0] ?? ""));
  if (unknown) return bad("TAG_NOT_ALLOWED", `Das Tag „${unknown[0]}" ist in einer persönlich signierten Aktion nicht erlaubt.`);
  for (const name of ["action", "role", "to", "seq", "occurred_at", "payload_hash", "from"]) {
    if (event.tags.filter((t) => t[0] === name).length > 1) return bad("BAD_EVENT", `Das Tag „${name}" kommt mehrfach vor.`);
  }
  if (parsed.object !== x.objectAddress) return bad("OBJECT_MISMATCH", "Das Ereignis nennt ein anderes Objekt.");
  if (parsed.proposal !== headAddress(town, x.proposalKey)) return bad("OBJECT_MISMATCH", "Das Ereignis nennt einen anderen Vorschlag.");
  if (event.content !== x.content) return bad("CONTENT_NOT_ALLOWED", "Der Text des Ereignisses entspricht nicht dem vorgesehenen Wortlaut.");
  if (Math.abs(parsed.occurredAt - deps.nowSec()) > OCCURRED_SKEW_SEC) return bad("STALE_EVENT", "Der Zeitpunkt des Ereignisses weicht zu stark ab.");
  if (parsed.to !== TARGET_STATUS[x.action]) return fail(409, "STATE_MISMATCH", "Das Ereignis nennt einen anderen Zielstatus.");
  if ((parsed.from ?? null) !== x.from) return fail(409, "STATE_MISMATCH", "Die Aufgabe hat sich geändert. Bitte lade neu.");

  // p tags: the first one is the signer (self-reference). Only task_assigned may also name the new assignee.
  const pTags = event.tags.filter((t) => t[0] === "p");
  if (pTags[0]?.[1] !== event.pubkey) return bad("BAD_ACTOR", "Das erste p-Tag muss den eigenen Schlüssel nennen.");
  for (const p of pTags.slice(1)) {
    if (x.action !== "task_assigned" || p[3] !== "assignee") return bad("BAD_ACTOR", "Weitere p-Tags sind hier nicht erlaubt.");
    const applicant = typeof payload.applicant === "string" ? payload.applicant.trim().toLowerCase() : "";
    const pk = applicant ? await deps.pubkeyForWallet(applicant) : null;
    if (!pk || pk !== p[1]) return bad("BAD_ACTOR", "Das assignee-p-Tag passt nicht zur ausgewählten Person.");
  }

  // Role marker: must be what the rules (and the outbox trigger) will record for this wallet.
  if (parsed.role !== x.role) return fail(403, "ROLE_MISMATCH", `Für diese Aktion ist die Rolle ${x.role} vorgesehen, das Ereignis nennt ${parsed.role}.`);
  if (!(PERSON_ACTION_ROLES[x.action] ?? []).includes(x.role) || !isTrustedAction(event, town)) {
    return fail(403, "ROLE_NOT_ALLOWED", "Diese Rolle darf diese Aktion nicht persönlich signieren.");
  }

  const next = await deps.nextSeq(x.objectType, x.objectId);
  if (parsed.seq !== next) return fail(409, "SEQ_CONFLICT", "Inzwischen ist eine andere Aktion eingegangen. Bitte lade neu.", next);
  return null;
}

/** After a successful action: attach the event to the outbox row the trigger created, if it is still ours. */
async function attach(deps: PersonEventDeps, c: Checked, x: Expect, check?: (row: OutboxMatch) => boolean): Promise<boolean> {
  const { event, parsed, wallet } = c;
  try {
    const row = await deps.findOutboxRow(x.objectType, x.objectId, x.action);
    const matches = !!row && row.seq === parsed.seq && (row.actorWallet ?? "").toLowerCase() === wallet
      && row.actorRole === parsed.role && row.toStatus === parsed.to && (row.fromStatus ?? null) === (parsed.from ?? null)
      && (!check || check(row));
    if (!row || !matches) {
      deps.log(`ALARM vorhaben/events: ${x.action} ${x.objectType}:${x.objectId} applied but outbox row ${row ? `${row.id} (seq ${row.seq})` : "missing"} does not match event ${event.id} (seq ${parsed.seq}); stays town-signed`);
      return false;
    }
    const ok = await deps.attachEvent(row.id, row.seq, event);
    if (!ok) deps.log(`vorhaben/events: outbox row ${row.id} already signed or published; event ${event.id} stays unattached`);
    return ok;
  } catch (e) {
    // The action is done; never fail it because the record attachment failed.
    deps.log(`ALARM vorhaben/events: attaching event ${event.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** POST body { event, action, payload, wallet? } — a task action. */
export async function handlePersonTaskEvent(deps: PersonEventDeps, body: unknown): Promise<PersonEventResult> {
  const b = (body && typeof body === "object" ? body : {}) as { event?: unknown; action?: unknown; payload?: unknown; wallet?: unknown };
  const town = (deps.townPubkey ?? "").trim().toLowerCase();
  if (!HEX64.test(town)) return fail(503, "FEATURE_OFF", "Signierte Nostr-Aktionen sind auf diesem Server nicht eingerichtet (VORHABEN_TOWN_PUBKEY fehlt).");
  const action = typeof b.action === "string" ? (b.action as VorhabenAction) : null;
  if (action === "task_apply" || action === "task_withdraw") {
    return bad("NOT_PERSON_SIGNABLE", "Bewerbungen laufen weiter über den bisherigen Weg (privat, Stufe 3).");
  }
  const nsp = action ? PERSON_SIGNED_ACTIONS[action] : undefined;
  if (!action || !nsp) return bad("NOT_PERSON_SIGNABLE", "Diese Aktion kann nicht als signiertes Nostr-Ereignis gesendet werden.");
  if (!b.payload || typeof b.payload !== "object" || Array.isArray(b.payload)) return bad("BAD_REQUEST", "payload fehlt.");
  const payload = b.payload as Record<string, unknown>;

  const base = await verifyBase(deps, b.event, b.wallet);
  if ("ok" in base) return base;
  const { wallet } = base;

  let x: Expect;
  if (action === "task_create") {
    const taskId = uuid(payload.taskId);
    const proposalUuid = uuid(payload.proposalId);
    if (!taskId) return bad("BAD_REQUEST", "Für eine signierte Aufgabe muss die App die Aufgaben-ID (taskId) vorgeben.");
    if (!proposalUuid) return bad("BAD_REQUEST", "Vorschlag fehlt.");
    const proposal = await deps.getProposal(proposalUuid);
    if (!proposal) return fail(404, "NOT_FOUND", "Vorschlag nicht gefunden.");
    const isProposer = proposal.proposer.toLowerCase() === wallet;
    x = { objectType: "task", objectId: taskId, objectAddress: taskAddress(base.town, taskId), proposalKey: proposal.proposalKey,
      action: nsp, role: isProposer ? "proposer" : "attester", from: null, content: DEFAULT_CONTENT[nsp] };
    if (!isProposer && !(await deps.isAttester(wallet))) return fail(403, "FORBIDDEN", "Nur Antragsteller:in oder Attester:innen können Aufgaben anlegen.");
  } else {
    const taskId = uuid(payload.taskId);
    if (!taskId) return bad("BAD_REQUEST", "Aufgabe fehlt.");
    const task = await deps.getTask(taskId);
    if (!task) return fail(404, "NOT_FOUND", "Aufgabe nicht gefunden.");
    const proposer = task.proposer.toLowerCase();
    // Same role derivation as the nostr_outbox_task_activity trigger.
    const role = nsp === "task_approved" || nsp === "changes_requested" ? "attester"
      : nsp === "task_assigned" || nsp === "task_cancelled" ? (wallet === proposer ? "proposer" : "attester")
      : "assignee";
    const reason = typeof payload.body === "string" ? payload.body.trim() : "";
    x = {
      objectType: "task", objectId: taskId, objectAddress: taskAddress(base.town, taskId), proposalKey: task.proposalKey,
      action: nsp, role,
      from: nsp === "proof_added" ? (task.status === "vergeben" ? "vergeben" : null) : task.status,
      content: PUBLIC_REASON_ACTIONS.has(nsp) && reason ? reason : DEFAULT_CONTENT[nsp],
    };
    // Real role check (the rules check again; this keeps the signed marker honest).
    if (base.parsed.role === role) {
      if (role === "assignee" && (task.assignee ?? "").toLowerCase() !== wallet) return fail(403, "FORBIDDEN", "Nur die zuständige Person kann das tun.");
      if (role === "attester" && !(await deps.isAttester(wallet))) return fail(403, "FORBIDDEN", "Nur Attester:innen können das tun.");
    }
    if (nsp === "proof_added") {
      const got = base.event.tags.filter((t) => t[0] === "url" || t[0] === "tx").map((t) => JSON.stringify(t)).sort();
      if (JSON.stringify(got) !== JSON.stringify(expectedProofTags(payload.attachments))) {
        return bad("PAYLOAD_MISMATCH", "Die Nachweis-Tags passen nicht zu den Anhängen.");
      }
    }
  }

  const claimFail = await checkClaims(deps, base, x, payload);
  if (claimFail) return claimFail;

  const r = await deps.runTaskAction(wallet, action, payload);
  if (!r.ok) return { ok: false, status: r.status, code: r.code, message: r.message };
  const personSigned = await attach(deps, base, x);
  const data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
  return { ok: true, data: { ...data, eventId: base.event.id, personSigned } };
}

/** POST body { event, kind: "tally_confirm", proposalId, signature, wallet? } — the Wahlhelfer co-sign. */
export async function handlePersonTallyEvent(deps: PersonEventDeps, body: unknown): Promise<PersonEventResult> {
  const b = (body && typeof body === "object" ? body : {}) as { event?: unknown; proposalId?: unknown; signature?: unknown; wallet?: unknown };
  const town = (deps.townPubkey ?? "").trim().toLowerCase();
  if (!HEX64.test(town)) return fail(503, "FEATURE_OFF", "Signierte Nostr-Aktionen sind auf diesem Server nicht eingerichtet (VORHABEN_TOWN_PUBKEY fehlt).");
  const proposalUuid = uuid(b.proposalId);
  const signature = typeof b.signature === "string" && /^0x[0-9a-fA-F]+$/.test(b.signature) ? b.signature : null;
  if (!proposalUuid || !signature) return bad("BAD_REQUEST", "proposalId/signature fehlen oder sind ungültig.");
  // Hash over exactly what the client sent (proposalId as given).
  const payload = { proposalId: b.proposalId as string, signature };

  const base = await verifyBase(deps, b.event, b.wallet);
  if ("ok" in base) return base;
  const { event, wallet } = base;
  const proposal = await deps.getProposal(proposalUuid);
  if (!proposal) return fail(404, "NOT_FOUND", "Vorschlag nicht gefunden.");
  const x: Expect = {
    objectType: "tally", objectId: proposalUuid, objectAddress: pollAddress(base.town, proposal.proposalKey),
    proposalKey: proposal.proposalKey, action: "tally_confirmed", role: "wahlhelfer", from: null,
    content: DEFAULT_CONTENT.tally_confirmed,
  };
  if (tagValue(event, "signature") !== signature) return bad("PAYLOAD_MISMATCH", "Die Wallet-Signatur im Ereignis passt nicht.");
  if ((tagValue(event, "signer_account") ?? "").toLowerCase() !== wallet) return bad("PAYLOAD_MISMATCH", "signer_account muss das eigene Konto sein.");
  if (tagValue(event, "chain") !== "100") return bad("PAYLOAD_MISMATCH", "chain muss 100 sein.");

  const claimFail = await checkClaims(deps, base, x, payload);
  if (claimFail) return claimFail;

  const r = await deps.runTallyConfirm(proposalUuid, wallet, signature);
  if (!r.ok) return { ok: false, status: r.status, code: r.code, message: r.message };
  // The signed text and result hash are computed by the tally service; attach only if the event carries the same.
  const personSigned = await attach(deps, base, x, (row) =>
    row.extra.message === tagValue(event, "signed_text") && row.extra.result_hash === tagValue(event, "result_hash")
    && row.extra.signature === signature);
  const lineIds = "lineIds" in r ? r.lineIds : [];
  return { ok: true, data: { lineIds, eventId: event.id, personSigned } };
}

export async function handlePersonEvent(deps: PersonEventDeps, body: unknown): Promise<PersonEventResult> {
  const kind = (body as { kind?: unknown } | null)?.kind;
  return kind === "tally_confirm" ? handlePersonTallyEvent(deps, body) : handlePersonTaskEvent(deps, body);
}
