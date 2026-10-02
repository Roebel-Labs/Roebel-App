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
 * Spec: docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md §3.2
 */
import type { NostrEvent } from "@netizen-labs/nostr";
import {
  LIFECYCLE_STAGES, kasseNoticeAddress, nsp12StageFor, nsp12TransitionsBetween,
  type KasseNotice, type LifecycleStage, type Stage,
} from "@netizen-labs/protocol";
import { TOWN_SCOPE, transitionToSpec, type PublishSpec } from "./mappers.js";
import { actionToSpec, kasseNoticeToSpec, type OutboxRow } from "./vorhaben.js";

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
async function publishTransitions(deps: OutboxDeps, row: OutboxRow, proposal: Row): Promise<{ count: number; complete: boolean }> {
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

  const now = deps.now();
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

export async function drainOutbox(deps: OutboxDeps, batch = 200): Promise<DrainSummary> {
  const summary: DrainSummary = { published: 0, failed: 0, waiting: 0, transitions: 0 };
  const rows = (await deps.fetchRows("nostr_outbox", `select=*&published_at=is.null&order=id.asc&limit=${batch}`)) as unknown as OutboxRow[];
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

  for (const row of rows) {
    const objectKey = `${row.object_type}:${row.object_id}`;
    if (blocked.has(objectKey)) { summary.waiting += 1; continue; }
    // Every exit below except success leaves the object blocked for the rest of this pass.
    blocked.add(objectKey);

    const proposal = proposals.get(String(row.proposal_id));
    if (!proposal) { await fail(row, "proposal_missing"); continue; }

    let event = row.signed_event as NostrEvent | null;
    if (!event) {
      const priorRows = await deps.fetchRows(
        "nostr_outbox",
        `select=event_id&object_type=eq.${row.object_type}&object_id=eq.${row.object_id}&published_at=not.is.null&order=id.desc&limit=1`,
      );
      const prior = typeof priorRows[0]?.event_id === "string" ? (priorRows[0].event_id as string) : null;
      const spec = actionToSpec(row, {
        townPubkey: deps.townPubkey,
        proposalKey: String(proposal.proposal_id ?? ""),
        actorPubkey: row.actor_wallet ? pubkeys.get(row.actor_wallet.toLowerCase()) ?? null : null,
        prior,
        now: deps.now(),
      });
      if (!spec) { await fail(row, "unmappable"); continue; }
      const signed = deps.sign(spec);
      try {
        // Store first: the event that goes out is the one the row remembers.
        await deps.updateRow("nostr_outbox", `id=eq.${row.id}`, { signed_event: signed, event_id: signed.id });
      } catch (e) {
        summary.failed += 1;
        deps.log(`nostr_outbox ${row.id}: storing the signed event failed, not publishing: ${errMsg(e)}`);
        continue;
      }
      event = signed;
    }

    const res = await send(deps, event);
    if (!res.ok) { await fail(row, res.message || "relay rejected"); continue; }

    if (row.action === "stage_changed") {
      let t: { count: number; complete: boolean };
      try {
        t = await publishTransitions(deps, row, proposal);
      } catch (e) {
        t = { count: 0, complete: false };
        deps.log(`nostr_outbox ${row.id}: transitions failed: ${errMsg(e)}`);
      }
      summary.transitions += t.count;
      if (!t.complete) { await fail(row, "transition_pending"); continue; }
    }

    try {
      await deps.updateRow("nostr_outbox", `id=eq.${row.id}`, { published_at: new Date(deps.now() * 1000).toISOString(), last_error: null });
    } catch (e) {
      // On the relay but not marked: the next pass re-sends the stored event (a duplicate). Keep the object blocked.
      deps.log(`nostr_outbox ${row.id}: published but not marked: ${errMsg(e)}`);
      continue;
    }
    summary.published += 1;
    blocked.delete(objectKey);
  }
  if (summary.published || summary.failed || summary.waiting) {
    deps.log(`outbox: published ${summary.published}, failed ${summary.failed}, waiting ${summary.waiting}, transitions ${summary.transitions}`);
  }
  return summary;
}
