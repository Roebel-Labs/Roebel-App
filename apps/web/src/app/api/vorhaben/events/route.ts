import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { verifyWalletSignature, VerifierUnavailableError } from "@/lib/signed-request/signature";
import { gnosisReader, isAttester, listAttesters } from "@/lib/vorhaben/chain";
import { handlePersonEvent, type OutboxMatch, type PersonEventDeps } from "@/lib/vorhaben/person-events";
import { verifyManualSafeTransfer } from "@/lib/vorhaben/rails/manual";
import { getProposal } from "@/lib/vorhaben/repo";
import { buildDispatch, buildSettle } from "@/lib/vorhaben/runtime";
import { loadSettings } from "@/lib/vorhaben/settings";
import { submitTallyConfirmation } from "@/lib/vorhaben/tally-service";
import { handleVorhabenAction } from "@/lib/vorhaben/task-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function must<T>(r: { data: unknown; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

function buildDeps(): PersonEventDeps {
  const db = createAdminClient();
  const reader = gnosisReader();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  return {
    townPubkey: process.env.VORHABEN_TOWN_PUBKEY,
    nowSec: () => Math.floor(Date.now() / 1000),
    walletForPubkey: async (pk) => {
      const row = must<{ wallet_address: string } | null>(await db.from("nostr_identities").select("wallet_address")
        .eq("pubkey_hex", pk.toLowerCase()).is("revoked_at", null).maybeSingle(), "identity read");
      return row?.wallet_address?.toLowerCase() ?? null;
    },
    pubkeyForWallet: async (w) => {
      const rows = must<Array<{ pubkey_hex: string }> | null>(await db.from("nostr_identities").select("pubkey_hex")
        .eq("wallet_address", w.toLowerCase()).is("revoked_at", null)
        .order("updated_at", { ascending: false }).limit(1), "identity read");
      return rows?.[0]?.pubkey_hex ?? null;
    },
    getTask: async (taskId) => {
      const t = must<{ proposal_id: string; status: string; assignee_wallet: string | null } | null>(
        await db.from("proposal_tasks").select("proposal_id, status, assignee_wallet").eq("id", taskId).maybeSingle(), "task read");
      if (!t) return null;
      const p = await getProposal(db, t.proposal_id);
      if (!p) return null;
      return { proposalUuid: p.id, proposalKey: p.proposal_id, proposer: p.proposer_address, status: t.status, assignee: t.assignee_wallet };
    },
    getProposal: async (id) => {
      const p = await getProposal(db, id);
      return p ? { proposalKey: p.proposal_id, proposer: p.proposer_address } : null;
    },
    isAttester: (w) => isAttester(reader, w),
    eventKnown: async (id) => {
      const rows = must<unknown[] | null>(await db.from("nostr_outbox").select("id").eq("event_id", id).limit(1), "outbox event read");
      return Array.isArray(rows) && rows.length > 0;
    },
    nextSeq: async (objectType, objectId) => {
      const n = must<number>(await db.rpc("next_outbox_seq", { p_object_type: objectType, p_object_id: objectId }), "next_outbox_seq");
      if (!Number.isSafeInteger(n) || n < 1) throw new Error(`next_outbox_seq returned ${String(n)}`);
      return n;
    },
    runTaskAction: async (wallet, action, payload) => handleVorhabenAction({
      db, settings: await loadSettings(db), nowMs: Date.now,
      isAttester: (w) => isAttester(reader, w),
      listAttesters: () => listAttesters(reader),
      verifyManualTx: verifyManualSafeTransfer,
      dispatch: buildDispatch(db),
      settle: buildSettle(db),
      storagePublicPrefix: supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/` : "",
    }, wallet, action, payload),
    runTallyConfirm: async (proposalUuid, wallet, signature) => submitTallyConfirmation({
      db, settings: await loadSettings(db), reader, nowMs: Date.now,
      verify: (w, m, s) => verifyWalletSignature(w, m, s),
      dispatch: buildDispatch(db),
    }, proposalUuid, wallet, signature),
    findOutboxRow: async (objectType, objectId, action) => {
      const r = must<Record<string, unknown> | null>(await db.from("nostr_outbox")
        .select("id, seq, actor_wallet, actor_role, from_status, to_status, extra")
        .eq("object_type", objectType).eq("object_id", objectId).eq("action", action).is("signed_event", null)
        .order("id", { ascending: false }).limit(1).maybeSingle(), "outbox read");
      if (!r) return null;
      return {
        id: Number(r.id), seq: Number(r.seq), actorWallet: (r.actor_wallet as string | null) ?? null, actorRole: String(r.actor_role),
        fromStatus: (r.from_status as string | null) ?? null, toStatus: String(r.to_status),
        extra: (r.extra && typeof r.extra === "object" ? r.extra : {}) as Record<string, unknown>,
      } satisfies OutboxMatch;
    },
    attachEvent: async (rowId, seq, event) => {
      const rows = must<unknown[] | null>(await db.from("nostr_outbox")
        .update({ signed_event: event, event_id: event.id, person_signed: true })
        .eq("id", rowId).eq("seq", seq).is("signed_event", null).is("published_at", null).select("id"), "outbox attach");
      return Array.isArray(rows) && rows.length > 0;
    },
    log: (m) => console.error(m),
  };
}

// POST { event, action, payload, wallet? } | { event, kind: "tally_confirm", proposalId, signature, wallet? }
// The person-signed kind-2101 event replaces the wallet-signed request (NSP-13 Stage 2).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonFail(400, "BAD_REQUEST", "Body fehlt.");
  try {
    const r = await handlePersonEvent(buildDeps(), body);
    if (r.ok) return jsonOk(r.data);
    if (r.next !== undefined) return NextResponse.json({ ok: false, code: r.code, message: r.message, next: r.next }, { status: r.status });
    return jsonFail(r.status, r.code, r.message);
  } catch (e) {
    if (e instanceof VerifierUnavailableError) return jsonFail(503, "VERIFY_UNAVAILABLE", "Signaturprüfung gerade nicht erreichbar. Bitte später erneut versuchen.");
    console.error("[vorhaben/events]", e);
    return jsonFail(500, "INTERNAL", "Aktion fehlgeschlagen.");
  }
}
