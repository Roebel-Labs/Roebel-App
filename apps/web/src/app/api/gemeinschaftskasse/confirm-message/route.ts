import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { addMessageConfirmation } from "@/lib/gemeinschaftskasse/safe-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { messageHash, inner, ownerAddress, isSmart, mode } = await req.json();
    if (!messageHash || !ownerAddress) {
      return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    if (!inner && mode !== "prevalidated") {
      return NextResponse.json({ error: "Ungültige Anfrage: inner oder mode=prevalidated erforderlich" }, { status: 400 });
    }
    await addMessageConfirmation({ messageHash, inner, ownerAddress, isSmart, prevalidated: mode === "prevalidated" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
