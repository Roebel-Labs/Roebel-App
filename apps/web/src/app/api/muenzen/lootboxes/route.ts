// CRUD /api/muenzen/lootboxes — manage the lootboxes (RCRC-priced keys, the
// sink side of the economy). Admin-gated, pure Supabase.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, getParam, jsonError } from "@/lib/muenzen/api";
import { bustCache } from "@/lib/muenzen/cache";
import { numberToAtto } from "@/lib/muenzen/constants";

export const dynamic = "force-dynamic";

function priceAtto(body: Record<string, unknown>): string | undefined {
  if (body.priceAtto != null) return String(body.priceAtto);
  if (body.price != null) return numberToAtto(Number(body.price));
  return undefined;
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
    const row: Record<string, unknown> = {
      name,
      description: body.description ?? null,
      image_url: body.imageUrl ?? null,
      muenzen_price_atto: priceAtto(body) ?? "0",
      coins_per_key: body.coinsPerKey != null ? Number(body.coinsPerKey) : null,
      guaranteed_reward_type: body.guaranteedRewardType ?? null,
      display_order: body.displayOrder != null ? Number(body.displayOrder) : 0,
      is_published: body.isPublished != null ? Boolean(body.isPublished) : false,
    };
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("lootboxes").insert(row).select().single();
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
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name != null) patch.name = String(body.name);
    if (body.description !== undefined) patch.description = body.description;
    if (body.imageUrl !== undefined) patch.image_url = body.imageUrl;
    const p = priceAtto(body);
    if (p !== undefined) patch.muenzen_price_atto = p;
    if (body.coinsPerKey !== undefined) patch.coins_per_key = body.coinsPerKey === null ? null : Number(body.coinsPerKey);
    if (body.guaranteedRewardType !== undefined) patch.guaranteed_reward_type = body.guaranteedRewardType;
    if (body.displayOrder !== undefined) patch.display_order = Number(body.displayOrder);
    if (body.isPublished != null) patch.is_published = Boolean(body.isPublished);
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("lootboxes").update(patch).eq("id", id).select().single();
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
    const { error } = await supabase.from("lootboxes").delete().eq("id", id);
    if (error) throw error;
    bustCache("rewards");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
