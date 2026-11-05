// Chat row insert shared by the viewer API, the test show and support settlement (server only).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorKey } from "./server";

export const CHAT_COLUMNS = "id, show_id, display_name, avatar_url, body, kind, amount_cents, created_at, hidden_at, featured_at";

type Row = { show_id: string; wallet: string | null; display_name: string; avatar_url?: string | null; body: string; kind: string; amount_cents?: number };

/** Inserts with author_key; falls back without it while migration 20261106b is not applied yet. */
export async function insertChat(admin: SupabaseClient, row: Row) {
  const key = authorKey(row.show_id, row.wallet);
  const first = await admin.from("live_chat_messages").insert({ ...row, author_key: key }).select(`${CHAT_COLUMNS}, author_key`).single();
  if (!first.error || !/author_key/.test(first.error.message)) return first;
  return admin.from("live_chat_messages").insert(row).select(CHAT_COLUMNS).single();
}
