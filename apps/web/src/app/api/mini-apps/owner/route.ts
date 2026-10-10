// POST /api/mini-apps/owner { id, wallet } — admin reassigns an app's owner.
import { NextResponse } from "next/server";
import { setAppOwner } from "@/lib/miniapp";
import { jsonError, requireAdmin } from "@/lib/miniapp/http";
import { MiniAppError } from "@/lib/miniapp/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string; wallet?: string };
    if (!body.id || !body.wallet) throw new MiniAppError("invalid_params", "id und wallet sind erforderlich.");
    return NextResponse.json({ app: await setAppOwner(body.id, body.wallet) });
  } catch (e) {
    return jsonError(e);
  }
}
