import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { LIVE_SCOPE, type LiveAction } from "@/lib/signed-request/message";
import { issueLiveToken } from "@/lib/live/token";
import { viewerProfile, authorKey, UUID_RE } from "@/lib/live/server";

export const dynamic = "force-dynamic";
const ACTIONS: readonly LiveAction[] = ["live_session"];

// POST signed (scope roebel-live-v1):
//   live_session { show_id } → { token, expires_at, display_name, avatar_url, author_key }
// author_key lets the app mark the viewer's own earlier messages ("du") after rejoining.
// The token authorises /api/live/act (chat, vote, remind) for 12 h without a signature per call.
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest<LiveAction>(await request.json().catch(() => null), {
    scope: LIVE_SCOPE, actions: ACTIONS, headers: request.headers,
  });
  if (!v.ok) return failResponse(v);
  const showId = String(v.payload.show_id ?? "");
  if (!UUID_RE.test(showId)) return jsonFail(400, "BAD_REQUEST", "show_id fehlt");
  const admin = createAdminClient();
  const { data: show } = await admin.from("live_shows").select("id").eq("id", showId).maybeSingle();
  if (!show) return jsonFail(404, "NOT_FOUND", "Übertragung nicht gefunden");
  const { token, expiresAt } = issueLiveToken(v.wallet, showId);
  const profile = await viewerProfile(admin, v.wallet);
  return jsonOk({ token, expires_at: expiresAt, ...profile, author_key: authorKey(showId, v.wallet) });
}
