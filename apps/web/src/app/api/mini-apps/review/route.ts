// POST /api/mini-apps/review — admin approves/rejects an app.
// Body: { id, decision: 'approve'|'reject', notes?: string }
// Approve → status 'live'; reject → 'rejected'. Also settles the pending version.
import { NextResponse } from "next/server";
import { reviewApp, MiniAppError } from "@/lib/miniapp";
import { getSession } from "@/lib/auth/session";
import { requireAdmin, jsonError } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    const decision = body.decision;
    if (!id) throw new MiniAppError("invalid_params", "id fehlt.");
    if (decision !== "approve" && decision !== "reject") {
      throw new MiniAppError("invalid_params", "decision muss 'approve' oder 'reject' sein.");
    }
    const session = await getSession();
    const reviewer = session?.username ?? "admin";
    const app = await reviewApp(id, decision, body.notes ?? null, reviewer);
    return NextResponse.json({ app });
  } catch (e) {
    return jsonError(e);
  }
}
