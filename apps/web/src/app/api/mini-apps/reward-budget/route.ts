// PATCH /api/mini-apps/reward-budget — admin sets an app's Röbel-Münzen budget.
// Body: { id, budget }
import { NextResponse } from "next/server";
import { setRewardBudget, MiniAppError } from "@/lib/miniapp";
import { requireAdmin, jsonError } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    const budget = Number(body.budget);
    if (!id) throw new MiniAppError("invalid_params", "id fehlt.");
    const app = await setRewardBudget(id, budget);
    return NextResponse.json({ app });
  } catch (e) {
    return jsonError(e);
  }
}
