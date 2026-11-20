// PATCH /api/mini-apps/gas-budget — admin grants an app's gas budget for sponsored calls.
// Body: { id, budgetXdai } (decimal xDAI string, stored as wei)
import { NextResponse } from "next/server";
import { setGasBudget, MiniAppError } from "@/lib/miniapp";
import { requireAdmin, jsonError } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id) throw new MiniAppError("invalid_params", "id fehlt.");
    const app = await setGasBudget(id, String(body.budgetXdai ?? ""));
    return NextResponse.json({ app });
  } catch (e) {
    return jsonError(e);
  }
}
