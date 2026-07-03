// GET /api/mini-apps/muenzen-balance?wallet=0x... — live Röbel-Münzen balance.
// Used by the web bridge host for `roebel.getMuenzenBalance`. Read-only, no
// secrets; the on-chain read is server-side (Gnosis RPC).
import { NextResponse } from "next/server";
import { getMuenzenBalance } from "@/lib/miniapp";
import { jsonError, getParam } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const wallet = getParam(req, "wallet") || "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json({ balance: "0", decimals: 18, symbol: "RÖ" });
    }
    const bal = await getMuenzenBalance(wallet);
    return NextResponse.json(bal);
  } catch (e) {
    return jsonError(e);
  }
}
