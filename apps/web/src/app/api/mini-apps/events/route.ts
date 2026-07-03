// /api/mini-apps/events
//   POST — anon-friendly telemetry ingest (from the host/SDK `track`). Never
//          gated; writes mini_app_events. Body accepts one event or a batch.
//   GET  — admin aggregate query (raw counts by event / recent rows).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestEvent } from "@/lib/miniapp";
import { requireAdmin, jsonError, getParam } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

interface EventInput {
  miniAppId?: string | null;
  slug?: string | null;
  sessionId: string;
  wallet?: string | null;
  event: string;
  ref?: string | null;
  props?: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows: EventInput[] = Array.isArray(body?.events)
      ? body.events
      : Array.isArray(body)
        ? body
        : [body];

    let written = 0;
    for (const r of rows.slice(0, 50)) {
      const res = await ingestEvent({
        miniAppId: r.miniAppId ?? null,
        slug: r.slug ?? null,
        sessionId: r.sessionId,
        wallet: r.wallet ?? null,
        event: r.event,
        ref: r.ref ?? null,
        props: r.props ?? {},
      });
      if (res.ok) written += 1;
    }
    // Anon telemetry: 204-style OK even if some rows were skipped.
    return NextResponse.json({ ok: true, written }, { status: 202 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const supabase = createAdminClient();
    const appId = getParam(req, "appId");
    const limit = Math.min(Number(getParam(req, "limit") ?? 200), 1000);

    let q = supabase
      .from("mini_app_events")
      .select("id, mini_app_id, slug, session_id, wallet, event, ref, props, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (appId && appId !== "all") q = q.eq("mini_app_id", appId);

    const { data, error } = await q;
    if (error) throw error;

    const byEvent = new Map<string, number>();
    for (const e of data ?? []) byEvent.set(e.event, (byEvent.get(e.event) ?? 0) + 1);

    return NextResponse.json({
      recent: data ?? [],
      byEvent: [...byEvent.entries()].map(([event, count]) => ({ event, count })),
    });
  } catch (e) {
    return jsonError(e);
  }
}
