import { notify } from "./notify";
import { planBudgetFeeLine } from "./payout-plan";
import { amountString, insertLines, toLineRows, type LineRow } from "./repo";
import { loadSettings, type Db } from "./settings";

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
  const lines = toLineRows(data);
  for (const l of lines) {
    try {
      const manual = l.rail === "manual_safe";
      // manual_safe lines have no send attempt: their clock starts when the hash was recorded (updated_at).
      const startIso = manual ? l.updated_at : l.attempt_started_at;
      const started = startIso ? new Date(startIso).getTime() : 0;
      // manual_safe lines get their hash from payout_record_manual; settle them here if that request did not.
      if ((FUNDER.has(l.rail) || manual) && l.tx_hash && IN_FLIGHT.has(l.status)) {
        const r = await settleIfMined(deps, l);
        if (r === "pending" && l.status !== "unklar" && deps.nowMs() - started > NOT_MINED_AFTER_MS) {
          const error = manual ? "not confirmed after 30 min — check the Safe transaction" : "not mined after 30 min — check funder history";
          if (await casStatus(deps.db, l.id, ["sendend", "gesendet"], { status: "unklar", error }))
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

/**
 * Side effects once a line is confirmed on-chain: budget fee line, task → ausgezahlt, treasury link,
 * recipient push. Runs AFTER the bestaetigt CAS, so it must never throw: each step logs its own failure.
 * The cron backstops what matters for money (sync re-creates a missing budget fee line).
 */
export async function afterLineSettled(db: Db, line: LineRow, proposalKeyOverride?: string): Promise<void> {
  const step = async (what: string, fn: () => Promise<void>) => {
    try { await fn(); }
    catch (e) { console.error(`[vorhaben] afterLineSettled ${what} failed for line ${line.id}`, e); }
  };
  const amount = amountString(line.amount);

  if (line.role === "empfaenger" && line.reference_type === "proposal") {
    // The platform fee on a budget exists only once the budget really left the Safe.
    await step("budget fee", async () => {
      const { data, error } = await db.from("proposal_contracts")
        .select("platform_fee_bps, platform_safe_address").eq("id", line.contract_id).single();
      if (error) throw new Error(`contract read: ${error.message}`);
      const c = data as { platform_fee_bps: number; platform_safe_address: string };
      const settings = await loadSettings(db);
      await insertLines(db, line.contract_id, line.proposal_id, planBudgetFeeLine(
        { proposalId: line.reference_id, amount, asset: line.asset },
        { bps: c.platform_fee_bps, platformSafe: c.platform_safe_address, budgetFeeRail: settings.budgetFeeRail }));
    });
  }
  if (line.role === "aufgabe") {
    await step("task status", async () => {
      const { error } = await db.from("proposal_tasks").update({ status: "ausgezahlt", updated_at: new Date().toISOString() })
        .eq("id", line.reference_id).eq("status", "abgenommen");
      if (error) throw new Error(error.message);
    });
  }
  if ((line.rail === "safe_eure" || line.rail === "manual_safe") && line.tx_hash) {
    const txHash = line.tx_hash.toLowerCase();
    await step("treasury link", async () => {
      const { error } = await db.from("treasury_tx_links")
        .upsert({ tx_hash: txHash, proposal_id: line.proposal_id }, { onConflict: "tx_hash", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    });
  }
  if (!line.recipient_wallet || line.role === "plattform") return;
  const wallet = line.recipient_wallet;
  await step("push", async () => {
    let proposalKey = proposalKeyOverride;
    if (!proposalKey) {
      const { data, error } = await db.from("proposals").select("proposal_id").eq("id", line.proposal_id).maybeSingle();
      if (error) throw new Error(`proposal read: ${error.message}`);
      proposalKey = (data as { proposal_id: string } | null)?.proposal_id;
    }
    if (!proposalKey) return;
    const unit = line.asset === "MUENZEN" ? "Röbel Münzen" : line.asset === "XDAI" ? "xDAI" : "€";
    await notify(db, [{
      wallet, kind: "vorhaben_payout", screen: "vertrag", proposalKey,
      title: "Auszahlung angekommen",
      body: `${amount.replace(".", ",")} ${unit} sind bei dir angekommen.`,
    }]);
  });
}
