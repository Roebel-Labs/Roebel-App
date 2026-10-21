import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";
import { describeTx } from "@/lib/gemeinschaftskasse/describe";
import { GK_SAFE } from "@/lib/gemeinschaftskasse/constants";
import { readTreasuryTxLabels } from "@/lib/treasury/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const kit = getApiKit();
    const res = await kit.getMultisigTransactions(GK_SAFE);
    const executed = res.results.filter((t) => t.isExecuted);
    const [items, labels] = await Promise.all([describeTx(executed), readTreasuryTxLabels().catch((): Record<string, string> => ({}))]);
    // Same tags the citizen history shows (app_settings.treasury_history_tx_labels).
    const tagged = items.map((t) => ({ ...t, tag: (t.transactionHash && labels[t.transactionHash.toLowerCase()]) || null }));
    return NextResponse.json({ items: tagged });
  } catch (e) {
    return jsonError(e);
  }
}
