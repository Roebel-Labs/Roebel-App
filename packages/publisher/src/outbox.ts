/**
 * NSP-13 outbox drain: `nostr_outbox` rows → signed 2101 actions on the relay,
 * plus the NSP-12 transitions (2100) and Gemeinschaftskasse notices (32102)
 * a stage change implies — each exactly once.
 *
 * Exactly-once rests on two stores:
 * - every 2101 is signed ONCE and stored on its row (signed_event + event_id)
 *   BEFORE it is sent; a retry re-sends the stored event (same id → a relay
 *   duplicate, never a second action);
 * - every 2100 is recorded in `nostr_stage_ledger` after the relay accepted it;
 *   the ledger is the only "where is this proposal on NSP-12" state, so a hop
 *   in the ledger is never published again.
 * A stage_changed row stays unpublished (and blocks its object) until all of
 * its transitions are on the record, so a failed hop is retried next pass.
 * Rollout order (every 2101 now carries a required `seq`): stop the publisher →
 * apply the 20261003 migration (adds nostr_outbox.seq) → deploy the new publisher.
 * No 2101 was ever published before this, so no legacy (seq-less) tolerance exists;
 * a row without a valid seq fails with last_error "seq_missing".
 * Spec: docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md §3.2
 */
import { verifyEvent, type NostrEvent } from "@netizen-labs/nostr";
import {
  LIFECYCLE_STAGES, kasseNoticeAddress, nsp12StageFor, nsp12TransitionsBetween,
  type KasseNotice, type LifecycleStage, type Stage,
} from "@netizen-labs/protocol";
import { TOWN_SCOPE, transitionToSpec, type PublishSpec } from "./mappers.js";
import { actionAddresses, actionToSpec, kasseNoticeToSpec, type OutboxRow } from "./vorhaben.js";

type Row = Record<string, unknown>;
type FetchRows = (table: string, query: string) => Promise<Row[]>;

export interface OutboxDeps {
  fetchRows: FetchRows;
  updateRow: (table: string, query: string, body: Record<string, unknown>) => Promise<void>;
  insertRow: (table: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  publish: (event: NostrEvent) => Promise<{ ok: boolean; message: string }>;
  /** signSpec bound to the node secret/id. */
  sign: (spec: PublishSpec) => NostrEvent;
  townPubkey: string;
  /** Unix seconds. */
  now: () => number;
  log: (m: string) => void;
}

export interface DrainSummary { published: number; failed: number; waiting: number; transitions: number }

const WALLET = /^0x[0-9a-f]{40}$/;
const SAFE_ID = /^[0-9A-Za-z-]+$/;
const ALARM_AT = 10;
const WAITING_ALARM = 50;
/** A person-signed row the API has not resolved after this long is overdue (the API should have attached or released it). */
const PERSON_WAIT_WARN_SECONDS = 15 * 60;

/** Wallets → pubkey_hex of their live (unrevoked) identity binding; keys are lowercase wallets. */
export async function resolvePubkeys(fetchRows: FetchRows, wallets: Iterable<unknown>): Promise<Map<string, string>> {
  const unique = [...new Set([...wallets].filter((w): w is string => typeof w === "string").map((w) => w.toLowerCase()).filter((w) => WALLET.test(w)))];
  const out = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    // ilike: the table stores whatever case the app wrote; hex has no wildcard chars.
    const or = `(${chunk.map((w) => `wallet_address.ilike.${w}`).join(",")})`;
    const rows = await fetchRows("nostr_identities", `select=wallet_address,pubkey_hex&revoked_at=is.null&or=${encodeURIComponent(or)}`);
    for (const r of rows) {
      const w = typeof r.wallet_address === "string" ? r.wallet_address.toLowerCase() : "";
      const pk = typeof r.pubkey_hex === "string" ? r.pubkey_hex : "";
      if (WALLET.test(w) && /^[0-9a-f]{64}$/.test(pk) && !out.has(w)) out.set(w, pk);
    }
  }
  return out;
}

/** A stored person event is well-formed only if it verifies and is a 2101 for this row's seq. */
function validPersonEvent(event: NostrEvent, seq: unknown): boolean {
  let valid = false;
  try { valid = verifyEvent(event); } catch { valid = false; }
  if (!valid) return false;
  const seqTag = event.tags?.find((t) => t[0] === "seq")?.[1];
  return event.kind === 2101 && seqTag === String(seq);
}

/**
 * Why a well-formed person event does not describe THIS row under THIS publisher's town key (null = it does):
 * object and proposal `a` addresses, action, `to`, and the first `p` tag naming the signer. The API checks the same
 * against VORHABEN_TOWN_PUBKEY; a mismatch here means that key and the node's derived town key differ, or the row moved.
 */
export function personEventMismatch(event: NostrEvent, row: OutboxRow, townPubkey: string, proposalKey: string): string | null {
  const want = actionAddresses(row, townPubkey, proposalKey);
  const marked = (marker: string) => event.tags.filter((t) => t[0] === "a" && t[3] === marker);
  const objects = marked("object");
  if (objects.length !== 1 || objects[0][1] !== want.object) return "object address";
  const heads = marked("proposal");
  if (heads.length !== 1 || heads[0][1] !== want.proposal) return "proposal address";
  const one = (name: string) => event.tags.filter((t) => t[0] === name);
  const action = one("action");
  if (action.length !== 1 || action[0][1] !== row.action) return "action";
  const to = one("to");
  if (to.length !== 1 || to[0][1] !== row.to_status) return "to";
  if (one("p")[0]?.[1] !== event.pubkey) return "first p tag is not the signer";
  return null;
}

const PATH: Stage[] = ["meinungsbild", "beschlussvorlage", "beschlossen", "umgesetzt"];

/** Current NSP-12 stage per the ledger: abgelehnt if recorded, else the furthest path stage, else meinungsbild. */
function ledgerStage(stages: Set<string>): Stage {
  if (stages.has("abgelehnt")) return "abgelehnt";
  for (let i = PATH.length - 1; i > 0; i--) if (stages.has(PATH[i])) return PATH[i];
  return "meinungsbild";
}

const REASON: Partial<Record<Stage, string>> = {
  beschlussvorlage: "Das Bürgervotum liegt vor. Die Gemeinschaftskasse entscheidet über die Umsetzung aus ihren eigenen Mitteln.",
  beschlossen: "Die Gemeinschaftskasse setzt den Vorschlag aus ihren eigenen Mitteln um.",
  abgelehnt: "Die Gemeinschaftskasse setzt den Vorschlag nicht um.",
  umgesetzt: "Der Vorschlag ist umgesetzt.",
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function send(deps: OutboxDeps, ev: NostrEvent): Promise<{ ok: boolean; message: string }> {
  try {
    return await deps.publish(ev);
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/**
 * Publishes the NSP-12 hops a stage change implies that the ledger does not
 * have yet. Notices first (a transition must cite an existing notice), then
 * the 2100s in path order. Returns how many 2100s landed and whether all did.
 */
async function publishTransitions(deps: OutboxDeps, row: OutboxRow, proposal: Row, at: number): Promise<{ count: number; complete: boolean }> {
  if (!(LIFECYCLE_STAGES as readonly string[]).includes(row.to_status)) return { count: 0, complete: true };
  const target = nsp12StageFor(row.to_status as LifecycleStage);
  const key = String(proposal.proposal_id ?? "");
  if (!key) { deps.log(`nostr_outbox ${row.id}: proposal ${row.proposal_id} has no proposal_id key`); return { count: 0, complete: false }; }

  const ledgerRows = await deps.fetchRows("nostr_stage_ledger", `select=nsp12_stage&proposal_id=eq.${row.proposal_id}`);
  const recorded = new Set(ledgerRows.map((r) => String(r.nsp12_stage)));
  let hops: ReturnType<typeof nsp12TransitionsBetween>;
  try {
    hops = nsp12TransitionsBetween(ledgerStage(recorded), target).filter((h) => !recorded.has(h.to));
  } catch (e) {
    // A backwards move (e.g. abgelehnt → beschlossen) has no legal NSP-12 path; the 2101 records it.
    deps.log(`nostr_outbox ${row.id}: ${errMsg(e)} — no transition published`);
    return { count: 0, complete: true };
  }
  if (!hops.length) return { count: 0, complete: true };

  // Deterministic: `at` is the stage row's stored 2101 created_at, so a retry
  // (relay OK but ledger write failed, or an OK that timed out) re-produces
  // the identical event ids — the relay sees a duplicate, never a second hop.
  const now = at;
  const notices: Array<{ kind: KasseNotice; txs: string[] }> = [];
  for (const h of hops) if (h.notice) notices.push({ kind: h.notice, txs: [] });
  if (hops.some((h) => h.to === "umgesetzt")) {
    const lines = await deps.fetchRows("proposal_payout_lines", `select=tx_hash&proposal_id=eq.${row.proposal_id}&status=eq.bestaetigt`);
    const txs = [...new Set(lines.map((l) => l.tx_hash).filter((t): t is string => typeof t === "string" && t !== ""))];
    notices.push({ kind: "ausgefuehrt", txs });
  }
  for (const n of notices) {
    const ev = deps.sign(kasseNoticeToSpec(proposal, n.kind, n.txs, now, deps.townPubkey));
    const res = await send(deps, ev);
    if (!res.ok) { deps.log(`nostr_outbox ${row.id}: notice ${n.kind} rejected: ${res.message}`); return { count: 0, complete: false }; }
  }

  let count = 0;
  for (const h of hops) {
    const spec = transitionToSpec({
      scope: TOWN_SCOPE, proposalId: key, headPubkey: deps.townPubkey, from: h.from, to: h.to, reason: REASON[h.to],
      noticeAddress: h.notice ? kasseNoticeAddress(deps.townPubkey, key, h.notice) : undefined, at: now,
    });
    if (!spec) { deps.log(`nostr_outbox ${row.id}: transition ${h.from} → ${h.to} unmappable`); return { count, complete: false }; }
    const ev = deps.sign(spec);
    const res = await send(deps, ev);
    if (!res.ok) { deps.log(`nostr_outbox ${row.id}: transition ${h.from} → ${h.to} rejected: ${res.message}`); return { count, complete: false }; }
    try {
      await deps.insertRow("nostr_stage_ledger", { proposal_id: row.proposal_id, nsp12_stage: h.to, event_id: ev.id });
    } catch (e) {
      // The 2100 is on the relay but unrecorded: a retry would publish a second one. Loud, never silent.
      deps.log(`ALARM nostr_stage_ledger ${row.proposal_id} ${h.to}: transition ${ev.id} published but ledger write failed: ${errMsg(e)}`);
      return { count, complete: false };
    }
    count += 1;
  }
  return { count, complete: true };
}

const hasSeq = (row: OutboxRow): row is OutboxRow & { seq: number } => Number.isSafeInteger(row.seq) && (row.seq as number) >= 1;

/**
 * Within one object, rows go out in `seq` order, not `id` order: the id comes from nextval at insert, the seq from
 * the trigger under the per-object advisory lock afterwards, so two concurrent inserts can get them inverted.
 * Each object keeps the batch positions its rows had; only which of its rows sits in which slot changes.
 * Rows without a seq sort last within their object (they fail `seq_missing`).
 */
export function orderBySeq(rows: OutboxRow[]): OutboxRow[] {
  const key = (r: OutboxRow) => `${r.object_type}:${r.object_id}`;
  const rank = (r: OutboxRow) => (hasSeq(r) ? r.seq : Number.MAX_SAFE_INTEGER);
  const groups = new Map<string, OutboxRow[]>();
  for (const r of rows) {
    const g = groups.get(key(r));
    if (g) g.push(r); else groups.set(key(r), [r]);
  }
  for (const g of groups.values()) g.sort((a, b) => rank(a) - rank(b) || Number(a.id) - Number(b.id));
  const cursor = new Map<string, number>();
  return rows.map((r) => {
    const k = key(r);
    const i = cursor.get(k) ?? 0;
    cursor.set(k, i + 1);
    return groups.get(k)![i];
  });
}

export async function drainOutbox(deps: OutboxDeps, batch = 200): Promise<DrainSummary> {
  const summary: DrainSummary = { published: 0, failed: 0, waiting: 0, transitions: 0 };
  const rows = orderBySeq((await deps.fetchRows("nostr_outbox", `select=*&published_at=is.null&order=id.asc&limit=${batch}`)) as unknown as OutboxRow[]);
  if (!rows.length) return summary;

  const proposalIds = [...new Set(rows.map((r) => r.proposal_id).filter((id) => typeof id === "string" && SAFE_ID.test(id)))];
  const proposals = new Map<string, Row>();
  if (proposalIds.length) {
    const found = await deps.fetchRows("proposals", `select=id,proposal_id,proposal_number,title,lifecycle_stage,tally_confirm_opened_at&id=in.(${proposalIds.join(",")})`);
    for (const p of found) proposals.set(String(p.id), p);
  }
  const pubkeys = await resolvePubkeys(deps.fetchRows, rows.map((r) => r.actor_wallet));

  const blocked = new Set<string>();
  const fail = async (row: OutboxRow, message: string) => {
    const attempts = (Number(row.attempts) || 0) + 1;
    summary.failed += 1;
    try {
      await deps.updateRow("nostr_outbox", `id=eq.${row.id}`, { attempts, last_error: message });
    } catch (e) {
      deps.log(`nostr_outbox ${row.id}: could not record failure: ${errMsg(e)}`);
    }
    if (attempts >= ALARM_AT) deps.log(`ALARM nostr_outbox ${row.id} ${row.action} ${row.object_type}:${row.object_id} failed ${attempts}×: ${message}`);
    else deps.log(`nostr_outbox ${row.id} ${row.action} failed (attempt ${attempts}): ${message}`);
  };

  let personWarned = false;

  /**
   * Clears a person event from its row (conditional on the row still holding exactly that event, unpublished) so the
   * town key signs the same seq instead. Honest: the action happened in the database; only who signs the record
   * changes. Returns false when the row changed under us (then nothing was cleared).
   */
  const release = async (row: OutboxRow, event: NostrEvent, reason: string, detail: string): Promise<boolean> => {
    const held = row.event_id ? `event_id=eq.${row.event_id}` : "event_id=is.null";
    try {
      await deps.updateRow("nostr_outbox", `id=eq.${row.id}&${held}&published_at=is.null`, { signed_event: null, event_id: null, person_signed: false, last_error: `${reason}: ${detail}` });
      const now = (await deps.fetchRows("nostr_outbox", `select=signed_event,person_signed&id=eq.${row.id}`))[0];
      if (!now || (now.signed_event !== null && now.signed_event !== undefined)) {
        deps.log(`nostr_outbox ${row.id}: releasing person event ${event.id} did not take (row changed); not re-signing`);
        return false;
      }
    } catch (e) {
      deps.log(`nostr_outbox ${row.id}: releasing person event ${event.id} failed: ${errMsg(e)}`);
      return false;
    }
    deps.log(`RELEASED nostr_outbox ${row.id} ${row.action} ${row.object_type}:${row.object_id} seq ${row.seq}: person event ${event.id} by ${event.pubkey} not relayed (${reason}: ${detail}); the town key signs this seq instead`);
    row.signed_event = null;
    row.event_id = null;
    row.person_signed = false;
    return true;
  };

  type Outcome = { kind: "exit" } | { kind: "event"; event: NostrEvent } | { kind: "mismatch"; event: NostrEvent; detail: string };
  /** The event to relay for a row: its stored/attached person event, or a freshly stored town signature. "exit" = already recorded as failed/waiting. */
  const resolveEvent = async (row: OutboxRow, prior: string | null, proposalKey: string): Promise<Outcome> => {
    const checkPerson = (ev: NostrEvent): Outcome => {
      const detail = personEventMismatch(ev, row, deps.townPubkey, proposalKey);
      return detail ? { kind: "mismatch", event: ev, detail } : { kind: "event", event: ev };
    };
    const event = row.signed_event as NostrEvent | null;
    if (row.person_signed === true) {
      // Person-signed: relayed verbatim once the API attached the event (unless released, see release()).
      if (!event) {
        summary.waiting += 1;
        const at = Date.parse(row.occurred_at);
        if (!personWarned && Number.isFinite(at) && deps.now() - at / 1000 > PERSON_WAIT_WARN_SECONDS) {
          personWarned = true;
          deps.log(`WARNING nostr_outbox ${row.id} ${row.action} ${row.object_type}:${row.object_id}: person-signed event not attached after 15 minutes (age measured from occurred_at)`);
        }
        return { kind: "exit" };
      }
      if (!validPersonEvent(event, row.seq)) { await fail(row, "person_event_invalid"); return { kind: "exit" }; }
      if (row.event_id && row.event_id !== event.id) { await fail(row, "person_event_id_mismatch"); return { kind: "exit" }; }
      return checkPerson(event);
    }
    if (event) return { kind: "event", event };
    const spec = actionToSpec(row, {
      townPubkey: deps.townPubkey,
      proposalKey,
      actorPubkey: row.actor_wallet ? pubkeys.get(row.actor_wallet.toLowerCase()) ?? null : null,
      prior,
      now: deps.now(),
    });
    if (!spec) { await fail(row, hasSeq(row) ? "unmappable" : "seq_missing"); return { kind: "exit" }; }
    const signed = deps.sign(spec);
    let stored: Row | undefined;
    try {
      // Store first: the event that goes out is the one the row remembers. Conditional on signed_event IS NULL so
      // it never overwrites a person event the API attached meanwhile; the re-read tells which one won.
      await deps.updateRow("nostr_outbox", `id=eq.${row.id}&signed_event=is.null`, { signed_event: signed, event_id: signed.id });
      stored = (await deps.fetchRows("nostr_outbox", `select=signed_event,event_id,person_signed,seq&id=eq.${row.id}`))[0];
    } catch (e) {
      summary.failed += 1;
      deps.log(`nostr_outbox ${row.id}: storing the signed event failed, not publishing: ${errMsg(e)}`);
      return { kind: "exit" };
    }
    const kept = (stored?.signed_event ?? null) as NostrEvent | null;
    if (!kept) { await fail(row, "store_lost"); return { kind: "exit" }; }
    if (kept.id === signed.id) return { kind: "event", event: kept };
    // The API attached the person's event first: relay that one (same checks as a person-signed row).
    if (stored?.person_signed !== true || !validPersonEvent(kept, row.seq)) { await fail(row, "person_event_invalid"); return { kind: "exit" }; }
    row.person_signed = true;
    row.signed_event = kept;
    row.event_id = typeof stored?.event_id === "string" ? stored.event_id : null;
    deps.log(`nostr_outbox ${row.id}: person event ${kept.id} attached before the town signature; relaying it`);
    return checkPerson(kept);
  };

  for (const row of rows) {
    const objectKey = `${row.object_type}:${row.object_id}`;
    if (blocked.has(objectKey)) { summary.waiting += 1; continue; }
    // Every exit below except success leaves the object blocked for the rest of this pass.
    blocked.add(objectKey);

    const proposal = proposals.get(String(row.proposal_id));
    if (!proposal) { await fail(row, "proposal_missing"); continue; }

    // The chain link is the row with seq - 1 on the same object, never "the last one published by id" (see orderBySeq).
    // A row whose predecessor is not on the record yet waits. Rows without a seq skip this and fail seq_missing below.
    let prior: string | null = null;
    if (hasSeq(row) && row.seq > 1) {
      const pred = (await deps.fetchRows(
        "nostr_outbox",
        `select=event_id,published_at&object_type=eq.${row.object_type}&object_id=eq.${row.object_id}&seq=eq.${row.seq - 1}&limit=1`,
      ))[0];
      if (!pred) { await fail(row, "predecessor_missing"); continue; }
      if (!pred.published_at) { summary.waiting += 1; continue; }
      if (typeof pred.event_id !== "string") { await fail(row, "predecessor_event_missing"); continue; }
      prior = pred.event_id;
    }

    const proposalKey = String(proposal.proposal_id ?? "");
    let outcome = await resolveEvent(row, prior, proposalKey);
    if (outcome.kind === "mismatch") {
      if (!(await release(row, outcome.event, "person_event_mismatch", outcome.detail))) { await fail(row, `person_event_mismatch: ${outcome.detail}`); continue; }
      outcome = await resolveEvent(row, prior, proposalKey);
      if (outcome.kind === "mismatch") { await fail(row, `person_event_mismatch: ${outcome.detail}`); continue; }
    }
    if (outcome.kind === "exit") continue;
    const event = outcome.event;

    const res = await send(deps, event);
    if (!res.ok) { await fail(row, res.message || "relay rejected"); continue; }

    if (row.action === "stage_changed") {
      let t: { count: number; complete: boolean };
      try {
        t = await publishTransitions(deps, row, proposal, event.created_at);
      } catch (e) {
        t = { count: 0, complete: false };
        deps.log(`nostr_outbox ${row.id}: transitions failed: ${errMsg(e)}`);
      }
      summary.transitions += t.count;
      if (!t.complete) { await fail(row, "transition_pending"); continue; }
    }

    try {
      await deps.updateRow("nostr_outbox", `id=eq.${row.id}`, { published_at: new Date(deps.now() * 1000).toISOString(), last_error: null, ...(row.person_signed === true ? { event_id: event.id } : {}) });
    } catch (e) {
      // On the relay but not marked: the next pass re-sends the stored event (a duplicate). Keep the object blocked.
      deps.log(`nostr_outbox ${row.id}: published but not marked: ${errMsg(e)}`);
      continue;
    }
    summary.published += 1;
    blocked.delete(objectKey);
  }
  if (summary.waiting > WAITING_ALARM) {
    deps.log(`ALARM nostr_outbox: ${summary.waiting} rows waiting behind failed objects this pass — an object may be wedged`);
  }
  if (summary.published || summary.failed || summary.waiting) {
    deps.log(`outbox: published ${summary.published}, failed ${summary.failed}, waiting ${summary.waiting}, transitions ${summary.transitions}`);
  }
  return summary;
}
