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

async function setStatus(db: Db, id: string, patch: Record<string, unknown>) {
  await db.from("proposal_payout_lines").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function dispatchLines(deps: DispatchDeps, lines: LineRow[]): Promise<void> {
  const todo = lines.filter((l) => l.status === "geplant");
  // Funder rail: one at a time keeps the funder nonce sane.
  for (const l of todo.filter((x) => FUNDER.has(x.rail))) {
    const r = await deps.sendFunder(l.id);
    if (r.status === "bestaetigt") await afterLineSettled(deps.db, { ...l, status: "bestaetigt", tx_hash: r.txHash ?? null });
  }
  // Safe rail: one batched Safe tx per reference (task line + its platform fee).
  const safe = todo.filter((x) => x.rail === "safe_eure");
  const groups = new Map<string, LineRow[]>();
  for (const l of safe) {
    const k = `${l.reference_type}:${l.reference_id}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  for (const g of groups.values()) await deps.proposeSafe(g);
  // manual_safe waits for a recorded hash; safe_eurc_base is not implemented yet.
}

/** Reconcile never re-sends: funder lines are only ever resolved by their receipt or flagged unklar. */
export async function reconcile(deps: DispatchDeps): Promise<void> {
  const { data } = await deps.db.from("proposal_payout_lines").select("*").neq("status", "bestaetigt").order("created_at");
  const lines = (data ?? []) as LineRow[];
  for (const l of lines) {
    const started = l.attempt_started_at ? new Date(l.attempt_started_at).getTime() : 0;
    if (FUNDER.has(l.rail) && l.tx_hash && IN_FLIGHT.has(l.status)) {
      const s = await deps.receiptStatus(l.tx_hash);
      if (s === "success") {
        await setStatus(deps.db, l.id, { status: "bestaetigt", error: null });
        l.status = "bestaetigt";
        await afterLineSettled(deps.db, l);
      } else if (s === "reverted") {
        await setStatus(deps.db, l.id, { status: "fehlgeschlagen", error: "reverted" });
      } else if (l.status !== "unklar" && deps.nowMs() - started > NOT_MINED_AFTER_MS) {
        await setStatus(deps.db, l.id, { status: "unklar", error: "not mined after 30 min — check funder history" });
        console.error(`[vorhaben] payout line ${l.id} is unklar (not mined); resolve manually`);
      }
    } else if (l.status === "sendend" && FUNDER.has(l.rail) && !l.tx_hash) {
      if (deps.nowMs() - started > UNKLAR_AFTER_MS) {
        await setStatus(deps.db, l.id, { status: "unklar", error: "no tx hash after send attempt — check the funder history before resolving" });
        console.error(`[vorhaben] payout line ${l.id} is unklar; resolve manually`);
      }
    } else if ((l.status === "sendend" || l.status === "vorgeschlagen") && l.rail === "safe_eure") {
      await deps.pollSafe(l);
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
