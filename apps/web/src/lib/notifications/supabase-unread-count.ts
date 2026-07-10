import type { SupabaseClient } from "@supabase/supabase-js";

import { PERSONAL_NOTIFICATION_LOG_FILTER } from "./policy";
import type { UnreadNotificationCountSources } from "./unread-count";

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

async function requireCount(query: PromiseLike<CountResult>): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function createSupabaseUnreadCountSources(
  supabase: SupabaseClient
): UnreadNotificationCountSources {
  return {
    async countBroadcastPush(after) {
      let query = supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .in("status", ["sent", "partial"])
        .not("notification_type", "in", PERSONAL_NOTIFICATION_LOG_FILTER);
      if (after) query = query.gt("created_at", after);
      return requireCount(query);
    },

    async countBroadcastActivity(after) {
      let query = supabase
        .from("app_notifications")
        .select("id", { count: "exact", head: true });
      if (after) query = query.gt("created_at", after);
      return requireCount(query);
    },

    async countPersonal(walletAddress, after) {
      let query = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_wallet", walletAddress);
      if (after) query = query.gt("created_at", after);
      return requireCount(query);
    },
  };
}
