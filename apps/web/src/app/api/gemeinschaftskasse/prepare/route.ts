import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { prepareSafeTx } from "@/lib/gemeinschaftskasse/safe-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { metaTx } = await req.json();
    const result = await prepareSafeTx(metaTx);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
