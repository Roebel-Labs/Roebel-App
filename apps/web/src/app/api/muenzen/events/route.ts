// CRUD /api/muenzen/events — manage reward_events (the registry the Smart Event
// QR + event_attend reward gate against). Admin-gated, pure Supabase.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, getParam, jsonError } from "@/lib/muenzen/api";
import { bustCache } from "@/lib/muenzen/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const label = String(body.label ?? "").trim();
    if (!label) return NextResponse.json({ error: "Bezeichnung fehlt" }, { status: 400 });
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("reward_events")
      .insert({
        label,
        starts_at: body.startsAt ?? null,
        expires_at: body.expiresAt ?? null,
        active: body.active != null ? Boolean(body.active) : true,
        created_by: body.createdBy ?? "admin",
      })
      .select()
      .single();
    if (error) throw error;
    bustCache("rewards");
    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (body.label != null) patch.label = String(body.label);
    if (body.startsAt !== undefined) patch.starts_at = body.startsAt;
    if (body.expiresAt !== undefined) patch.expires_at = body.expiresAt;
    if (body.active != null) patch.active = Boolean(body.active);
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("reward_events").update(patch).eq("id", id).select().single();
    if (error) throw error;
    bustCache("rewards");
    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const id = getParam(req, "id");
    if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
    const supabase = createAdminClient();
    const { error } = await supabase.from("reward_events").delete().eq("id", id);
    if (error) throw error;
    bustCache("rewards");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
