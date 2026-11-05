// On-stage switching shared by the operator API and the test show (server only).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushToWallets } from "./server";

type Item = { id: string; position: number; title: string; subtitle: string | null; status: string };

/** Pushes reminder holders of `item` once (sent_at marks it). */
async function notifyReminders(admin: SupabaseClient, item: Item, slug: string, title: string, body: string) {
  const { data: rows } = await admin.from("live_reminders").select("wallet").eq("item_id", item.id).is("sent_at", null);
  const wallets = (rows ?? []).map((r) => r.wallet as string);
  if (wallets.length === 0) return 0;
  await admin.from("live_reminders").update({ sent_at: new Date().toISOString() }).eq("item_id", item.id).in("wallet", wallets);
  await pushToWallets(wallets, title, body, { liveSlug: slug, url: `/live/${slug}` });
  return wallets.length;
}

export async function setOnStage(admin: SupabaseClient, show: { id: string; slug: string }, itemId: string | null) {
  const now = new Date().toISOString();
  await admin.from("live_rundown_items").update({ status: "done" }).eq("show_id", show.id).eq("status", "on_stage");
  if (!itemId) {
    await admin.from("live_shows").update({ current_item_id: null, updated_at: now }).eq("id", show.id);
    return { current: null, notified: 0 };
  }
  const { data: item } = await admin.from("live_rundown_items")
    .update({ status: "on_stage", on_stage_at: now }).eq("id", itemId).eq("show_id", show.id)
    .select("id, position, title, subtitle, status").single();
  if (!item) throw new Error("Programmpunkt nicht gefunden");
  await admin.from("live_shows").update({ current_item_id: item.id, updated_at: now }).eq("id", show.id);
  // Reminders: holders of the item on stage now (if not told yet) and of the next one (lead time).
  let notified = await notifyReminders(admin, item, show.slug, `Jetzt live: ${item.title}`, "Gerade auf der Fläche – schau in der Röbel App zu.");
  const { data: next } = await admin.from("live_rundown_items").select("id, position, title, subtitle, status")
    .eq("show_id", show.id).eq("status", "upcoming").gt("position", item.position).order("position").limit(1).maybeSingle();
  if (next) notified += await notifyReminders(admin, next, show.slug, `Gleich dran: ${next.title}`, "Als Nächstes auf der Fläche – jetzt einschalten.");
  return { current: item, notified };
}

/** Next upcoming item after the current one; `wrap` starts over at the top (test show). */
export async function advance(admin: SupabaseClient, show: { id: string; slug: string; current_item_id: string | null }, wrap = false) {
  const { data: cur } = show.current_item_id
    ? await admin.from("live_rundown_items").select("position").eq("id", show.current_item_id).maybeSingle()
    : { data: null };
  const { data: next } = await admin.from("live_rundown_items").select("id")
    .eq("show_id", show.id).eq("status", "upcoming").gt("position", cur?.position ?? -1)
    .order("position").limit(1).maybeSingle();
  if (next) return setOnStage(admin, show, next.id);
  if (!wrap) return null;
  await admin.from("live_rundown_items").update({ status: "upcoming", on_stage_at: null }).eq("show_id", show.id);
  await admin.from("live_reminders").update({ sent_at: null }).in("item_id",
    ((await admin.from("live_rundown_items").select("id").eq("show_id", show.id)).data ?? []).map((r) => r.id));
  const { data: first } = await admin.from("live_rundown_items").select("id").eq("show_id", show.id).order("position").limit(1).maybeSingle();
  return first ? setOnStage(admin, { id: show.id, slug: show.slug }, first.id) : null;
}
