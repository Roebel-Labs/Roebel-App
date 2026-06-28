import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getSafeOverview } from "@/lib/gemeinschaftskasse/safe-reads";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const you = new URL(req.url).searchParams.get("you") || undefined;
    const data = await getSafeOverview(you);
    return NextResponse.json({
      owners: data.owners,
      threshold: data.threshold,
      euro: data.euro,
      balances: {
        xdai: data.balances.xdai.toString(),
        eure: data.balances.eure.toString(),
        muenzen: data.balances.muenzen.toString(),
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
