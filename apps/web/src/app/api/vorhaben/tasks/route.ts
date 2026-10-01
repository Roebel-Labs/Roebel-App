import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VORHABEN_SCOPE, type VorhabenAction } from "@/lib/signed-request/message";
import { failResponse, jsonFail, jsonOk, verifySignedRequest } from "@/lib/signed-request/verify";
import { gnosisReader, isAttester, listAttesters } from "@/lib/vorhaben/chain";
import { verifyManualSafeTransfer } from "@/lib/vorhaben/rails/manual";
import { buildDispatch, buildSettle } from "@/lib/vorhaben/runtime";
import { loadSettings } from "@/lib/vorhaben/settings";
import { handleVorhabenAction } from "@/lib/vorhaben/task-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTIONS: readonly VorhabenAction[] = ["task_create", "task_apply", "task_withdraw", "task_assign", "task_start", "task_comment",
  "task_proof", "task_submit", "task_approve", "task_request_changes", "task_cancel", "payout_record_manual"];
// Money-moving actions always need a fresh wallet signature (no session token).
const SIGNATURE_REQUIRED: readonly VorhabenAction[] = ["task_approve", "payout_record_manual"];

// POST signed { scope: "roebel-vorhaben-v1", action, wallet, timestampSec, payload, signature }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const action = (body as { action?: unknown } | null)?.action;
  const v = await verifySignedRequest<VorhabenAction>(body, {
    scope: VORHABEN_SCOPE, actions: ACTIONS, headers: request.headers,
    requireSignature: typeof action === "string" && SIGNATURE_REQUIRED.includes(action as VorhabenAction),
  });
  if (!v.ok) return failResponse(v);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  try {
    const db = createAdminClient();
    const reader = gnosisReader();
    const r = await handleVorhabenAction({
      db, settings: await loadSettings(db), nowMs: Date.now,
      isAttester: (w) => isAttester(reader, w),
      listAttesters: () => listAttesters(reader),
      verifyManualTx: verifyManualSafeTransfer,
      dispatch: buildDispatch(db),
      settle: buildSettle(db),
      storagePublicPrefix: supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/` : "",
    }, v.wallet, v.action, v.payload);
    return r.ok ? jsonOk(r.data) : jsonFail(r.status, r.code, r.message);
  } catch (e) {
    console.error("[vorhaben/tasks]", e);
    return jsonFail(500, "INTERNAL", "Aktion fehlgeschlagen.");
  }
}
