import type { LineRow } from "./repo";
import type { Db } from "./settings";
import { notify } from "./notify";

export interface DispatchDeps {
  db: Db;
  sendFunder: (lineId: string) => Promise<{ status: string; txHash?: string }>;
  proposeSafe: (lines: LineRow[]) => Promise<void>;
  pollSafe: (line: LineRow) => Promise<void>;
  receiptStatus: (txHash: string) => Promise<"success" | "reverted" | "pending">;
  nowMs: () => number;
}

export const UNKLAR_AFTER_MS = 10 * 60 * 1000;
export const NOT_MINED_AFTER_MS = 30 * 60 * 1000;
const FUNDER = new Set(["funder_muenzen", "funder_xdai"]);
const IN_FLIGHT = new Set(["sendend", "gesendet", "unklar"]);

const OPEN_STATUSES = ["sendend", "gesendet", "unklar", "vorgeschlagen"];

/** Compare-and-set status write; true only if this call changed the row. */
export async function casStatus(db: Db, id: string, from: string[], patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db.from("proposal_payout_lines")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id).in("status", from).select("id");
  if (error) throw new Error(`cas ${id}: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** The ONLY path that moves a line to bestaetigt / runs afterLineSettled. */
export async function settleIfMined(deps: Pick<DispatchDeps, "db" | "receiptStatus">, line: LineRow): Promise<"settled" | "reverted" | "pending" | "skipped"> {
  if (!line.tx_hash) return "skipped";
  const s = await deps.receiptStatus(line.tx_hash);
  if (s === "pending") return "pending";
  if (s === "success") {
    if (!(await casStatus(deps.db, line.id, OPEN_STATUSES, { status: "bestaetigt", error: null }))) return "skipped";
    await afterLineSettled(deps.db, { ...line, status: "bestaetigt" });
    return "settled";
  }
  if (!(await casStatus(deps.db, line.id, OPEN_STATUSES, { status: "fehlgeschlagen", error: "reverted" }))) return "skipped";
  return "reverted";
}

export async function dispatchLines(deps: DispatchDeps, lines: LineRow[]): Promise<void> {
  const todo = lines.filter((l) => l.status === "geplant");
  // Funder rail: one at a time keeps the funder nonce sane.
  for (const l of todo.filter((x) => FUNDER.has(x.rail))) {
    try {
      const r = await deps.sendFunder(l.id);
      if ((r.status === "gesendet" || r.status === "bestaetigt") && r.txHash) {
        await settleIfMined(deps, { ...l, status: "gesendet", tx_hash: r.txHash }); // pending is fine; the cron finishes it
      }
    } catch (e) {
      console.error(`[vorhaben] funder send failed for line ${l.id}`, e);
    }
  }
  // Safe rail: one batched Safe tx per reference (task line + its platform fee).
  const safe = todo.filter((x) => x.rail === "safe_eure");
  const groups = new Map<string, LineRow[]>();
  for (const l of safe) {
    const k = `${l.reference_type}:${l.reference_id}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  for (const g of groups.values()) {
    try { await deps.proposeSafe(g); }
    catch (e) { console.error(`[vorhaben] Safe proposal failed for lines ${g.map((x) => x.id).join(",")}`, e); }
  }
  // manual_safe waits for a recorded hash; safe_eurc_base is not implemented yet.
}

/** Reconcile never re-sends: funder lines are only ever resolved by their receipt or flagged unklar. */
export async function reconcile(deps: DispatchDeps): Promise<void> {
  const { data, error } = await deps.db.from("proposal_payout_lines").select("*")
    .in("status", OPEN_STATUSES).order("created_at");
  if (error) throw new Error(`reconcile query: ${error.message}`);
  const lines = (data ?? []) as LineRow[];
  for (const l of lines) {
    try {
      const started = l.attempt_started_at ? new Date(l.attempt_started_at).getTime() : 0;
      // manual_safe lines get their hash from payout_record_manual; settle them here if that request did not.
      if ((FUNDER.has(l.rail) || l.rail === "manual_safe") && l.tx_hash && IN_FLIGHT.has(l.status)) {
        const r = await settleIfMined(deps, l);
        if (r === "pending" && l.status !== "unklar" && deps.nowMs() - started > NOT_MINED_AFTER_MS) {
          if (await casStatus(deps.db, l.id, ["sendend", "gesendet"], { status: "unklar", error: "not mined after 30 min — check funder history" }))
            console.error(`[vorhaben] payout line ${l.id} is unklar (not mined); resolve manually`);
        }
      } else if (l.status === "sendend" && FUNDER.has(l.rail) && !l.tx_hash) {
        if (deps.nowMs() - started > UNKLAR_AFTER_MS) {
          if (await casStatus(deps.db, l.id, ["sendend"], { status: "unklar", error: "no tx hash after send attempt — check the funder history before resolving" }))
            console.error(`[vorhaben] payout line ${l.id} is unklar; resolve manually`);
        }
      } else if (l.status === "sendend" && l.rail === "safe_eure" && !l.safe_tx_hash) {
        if (deps.nowMs() - started > UNKLAR_AFTER_MS) {
          if (await casStatus(deps.db, l.id, ["sendend"], { status: "unklar", error: "no safe hash after claim" }))
            console.error(`[vorhaben] payout line ${l.id} is unklar (no safe hash after claim); resolve manually`);
        }
      } else if ((l.status === "sendend" || l.status === "vorgeschlagen") && l.rail === "safe_eure") {
        await deps.pollSafe(l);
      }
    } catch (e) {
      console.error(`[vorhaben] reconcile failed for line ${l.id}`, e);
    }
  }
}

/** Side effects once a line is confirmed on-chain: task → ausgezahlt, recipient push. */
export async function afterLineSettled(db: Db, line: LineRow, proposalKeyOverride?: string): Promise<void> {
  if (line.role === "aufgabe") {
    await db.from("proposal_tasks").update({ status: "ausgezahlt", updated_at: new Date().toISOString() })
      .eq("id", line.reference_id).eq("status", "abgenommen");
  }
  if (line.rail === "safe_eure" || line.rail === "manual_safe") {
    if (line.tx_hash) await db.from("treasury_tx_links").upsert({ tx_hash: line.tx_hash.toLowerCase(), proposal_id: line.proposal_id }, { onConflict: "tx_hash", ignoreDuplicates: true });
  }
  if (!line.recipient_wallet || line.role === "plattform") return;
  let proposalKey = proposalKeyOverride;
  if (!proposalKey) {
    const { data } = await db.from("proposals").select("proposal_id").eq("id", line.proposal_id).maybeSingle();
    proposalKey = (data as { proposal_id: string } | null)?.proposal_id;
  }
  if (!proposalKey) return;
  const unit = line.asset === "MUENZEN" ? "Röbel Münzen" : line.asset === "XDAI" ? "xDAI" : "€";
  await notify(db, [{
    wallet: line.recipient_wallet, kind: "vorhaben_payout", screen: "vertrag", proposalKey,
    title: "Auszahlung angekommen",
    body: `${line.amount.replace(".", ",")} ${unit} sind bei dir angekommen.`,
  }]);
}
