import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { encodeExecution } from "@/lib/gemeinschaftskasse/safe-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { safeTxHash } = await req.json();
    if (!safeTxHash) {
      return NextResponse.json({ error: "safeTxHash fehlt" }, { status: 400 });
    }
    const result = await encodeExecution(safeTxHash);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
