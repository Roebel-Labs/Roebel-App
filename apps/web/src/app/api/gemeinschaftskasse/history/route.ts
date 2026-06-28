import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";
import { describeTx } from "@/lib/gemeinschaftskasse/describe";
import { GK_SAFE } from "@/lib/gemeinschaftskasse/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const kit = getApiKit();
    const res = await kit.getMultisigTransactions(GK_SAFE);
    const executed = res.results.filter((t) => t.isExecuted);
    return NextResponse.json({ items: await describeTx(executed) });
  } catch (e) {
    return jsonError(e);
  }
}
