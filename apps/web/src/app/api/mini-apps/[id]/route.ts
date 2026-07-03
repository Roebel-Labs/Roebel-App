// GET  /api/mini-apps/[id]  — fetch one app (by uuid or slug) + its versions.
// PATCH /api/mini-apps/[id] — update. Two modes:
//   • developer manifest edit: { manifest, wallet } → re-enters review (owner only)
//   • admin field update:      { featured?, reward_budget?, status?, review_notes? }
import { NextResponse } from "next/server";
import {
  getApp,
  listVersions,
  updateAppManifest,
  setRewardBudget,
  toggleFeatured,
  setStatus,
  reviewApp,
  MiniAppError,
  type MiniAppStatus,
} from "@/lib/miniapp";
import { isAuthenticated, getSession } from "@/lib/auth/session";
import { jsonError, resolveDeveloperReadonly } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const app = await getApp(id);
    if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");
    const versions = await listVersions(app.id);
    return NextResponse.json({ app, versions });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const app = await getApp(id);
    if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");

    const isAdmin = await isAuthenticated();

    // ── Developer manifest edit (owner only) ────────────────────────────────
    if (body.manifest) {
      const dev = await resolveDeveloperReadonly(req, body);
      if (!isAdmin && (!dev || dev.id !== app.developer_id)) {
        throw new MiniAppError("unauthorized", "Nur der Ersteller darf diese App bearbeiten.");
      }
      const updated = await updateAppManifest(app.id, body.manifest, {
        newVersion: body.version,
      });
      return NextResponse.json({ app: updated });
    }

    // ── Admin field updates ─────────────────────────────────────────────────
    if (!isAdmin) throw new MiniAppError("unauthorized", "Admin erforderlich.");
    const session = await getSession();
    const reviewer = session?.username ?? "admin";

    let result = app;
    if (typeof body.featured === "boolean") {
      result = await toggleFeatured(app.id, body.featured);
    }
    if (typeof body.reward_budget === "number") {
      result = await setRewardBudget(app.id, body.reward_budget);
    }
    if (typeof body.review_notes === "string" || body.decision) {
      if (body.decision === "approve" || body.decision === "reject") {
        result = await reviewApp(app.id, body.decision, body.review_notes ?? null, reviewer);
      }
    }
    if (typeof body.status === "string") {
      result = await setStatus(app.id, body.status as MiniAppStatus);
    }
    return NextResponse.json({ app: result });
  } catch (e) {
    return jsonError(e);
  }
}
