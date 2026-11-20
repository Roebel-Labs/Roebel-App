import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCors, corsPreflight } from "@/lib/live/cors";

export const dynamic = "force-dynamic";

// GET → { ok, data: { voting_open, total, items: [{ item_id, title, subtitle, votes }] } }
// Publikumsliebling (a Meinungsbild): counts only, never who voted. Cached briefly at the edge.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return withCors(await handle(req, ctx));
}

export function OPTIONS() {
  return corsPreflight();
}

async function handle(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: show } = await admin.from("live_shows").select("id, voting_open").eq("slug", slug).maybeSingle();
  if (!show) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "Übertragung nicht gefunden" }, { status: 404 });
  const [{ data: counts }, { data: items }] = await Promise.all([
    admin.rpc("live_vote_results", { p_show_id: show.id }),
    admin.from("live_rundown_items").select("id, title, subtitle").eq("show_id", show.id),
  ]);
  const byId = new Map((items ?? []).map((i) => [i.id as string, i]));
  const rows = ((counts ?? []) as { item_id: string; votes: number }[])
    .filter((c) => byId.has(c.item_id))
    .map((c) => ({ item_id: c.item_id, title: byId.get(c.item_id)!.title, subtitle: byId.get(c.item_id)!.subtitle ?? null, votes: Number(c.votes) }))
    .sort((a, b) => b.votes - a.votes);
  const total = rows.reduce((s, r) => s + r.votes, 0);
  return NextResponse.json(
    { ok: true, data: { voting_open: show.voting_open, total, items: rows } },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } },
  );
}
