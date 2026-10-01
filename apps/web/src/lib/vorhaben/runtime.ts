// Production wiring for the payout engine: one place that builds DispatchDeps (funder rail,
// env-gated Safe rail, receipt checks) for the cron and the API routes.
import { createPublicClient, http } from "viem";
import { gnosis } from "viem/chains";
import { dispatchLines, settleIfMined, type DispatchDeps } from "./dispatch";
import { sendViaFunder } from "./rails/funder";
import { safeRailFromEnv } from "./rails/safe";
import { toLineRows, type LineRow } from "./repo";
import type { Db } from "./settings";

const RPC = () => process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com";

export function buildReceiptStatus(): DispatchDeps["receiptStatus"] {
  // batch:false — publicnode/gnosischain RPCs have returned null for batched calls before.
  const pub = createPublicClient({ chain: gnosis, transport: http(RPC(), { batch: false }) });
  return async (hash) => {
    const r = await pub.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
    return !r ? "pending" : r.status === "success" ? "success" : "reverted";
  };
}

export function buildDispatchDeps(db: Db): DispatchDeps {
  const receiptStatus = buildReceiptStatus();
  const safeRail = safeRailFromEnv(db, receiptStatus);
  return {
    db, sendFunder: sendViaFunder, nowMs: Date.now, receiptStatus,
    proposeSafe: safeRail?.proposeSafe ?? (async () => {}),
    pollSafe: safeRail?.pollSafe ?? (async () => {}),
  };
}

/** Dispatches the given line ids (only `geplant` ones are acted on). */
export function buildDispatch(db: Db): (lineIds: string[]) => Promise<void> {
  return async (lineIds) => {
    if (lineIds.length === 0) return;
    const { data, error } = await db.from("proposal_payout_lines").select("*").in("id", lineIds);
    if (error) throw new Error(`dispatch lines read: ${error.message}`);
    await dispatchLines(buildDispatchDeps(db), toLineRows(data));
  };
}

/** Settles one line through the single receipt-checked path. */
export function buildSettle(db: Db): (line: LineRow) => Promise<string> {
  const receiptStatus = buildReceiptStatus();
  return (line) => settleIfMined({ db, receiptStatus }, line);
}
