import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/coordinator/audit-log?cursor=<ISO>&limit=50&eventType=share_submitted
 *
 * Paginated audit log read for the history page. Cursor is the `created_at`
 * of the last row from the previous page; we return rows STRICTLY OLDER than
 * the cursor. Caps `limit` at 100.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const eventType = url.searchParams.get("eventType");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  const supabase = createAdminClient();
  let q = supabase
    .from("coordinator_audit_log")
    .select("id, event_type, actor_wallet, target_id, tx_hash, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    q = q.lt("created_at", cursor);
  }
  if (eventType) {
    q = q.eq("event_type", eventType);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[audit-log] query failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const nextCursor =
    rows.length === limit ? rows[rows.length - 1].created_at : null;
  return NextResponse.json({ rows, nextCursor });
}
