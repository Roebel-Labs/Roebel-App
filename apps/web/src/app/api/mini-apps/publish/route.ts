/**
 * POST /api/mini-apps/publish
 *
 * Managed publish for an AI-generated mini app. Takes the file-plan produced by
 * /api/mini-apps/generate, writes it into apps/mini-apps/<slug>/, and registers
 * a `mini_apps` row (source='ai_builder', status='pending', reward_budget 0) so
 * it enters the admin review queue.
 *
 * Body: { plan: MiniAppFilePlan; developerId?: string }
 */
import { publishMiniApp } from "@/lib/miniapp/ai/publish";

export const maxDuration = 60;
export const runtime = "nodejs"; // needs node:fs to write files

export async function POST(request: Request) {
  let body: { plan?: unknown; developerId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.plan || typeof body.plan !== "object") {
    return Response.json({ error: "plan_required" }, { status: 400 });
  }

  const developerId =
    typeof body.developerId === "string" && body.developerId.length > 0
      ? body.developerId
      : null;

  try {
    const result = await publishMiniApp({ plan: body.plan, developerId });
    if (!result.ok) {
      // Map guard failures to a client-actionable 409/400.
      const conflict =
        result.error?.startsWith("slug_taken") ||
        result.error?.startsWith("slug_directory_exists") ||
        result.error?.startsWith("slug_reserved");
      return Response.json(result, { status: conflict ? 409 : 400 });
    }
    return Response.json(result, { status: 201 });
  } catch (e) {
    console.error("[mini-apps/publish] failed", e);
    return Response.json({ error: "publish_failed" }, { status: 500 });
  }
}
