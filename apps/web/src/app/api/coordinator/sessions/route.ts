import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyIsFounder,
  verifyWalletSignature,
} from "@/lib/shamir/signature-verification";

/**
 * POST /api/coordinator/sessions
 *
 * Founder triggers a tally session for `pollId`. Body:
 *   { founderWallet, signature, pollId, timeoutMs? }
 *
 * We forward to the coordinator service's POST /sessions endpoint with the
 * shared FINALIZE_TOKEN (held only on the server). The coordinator service
 * spawns scripts/reconstructor.js, which writes a coordinator_sessions row
 * and signs the session manifest with the coordinator EOA.
 *
 * Why not let the browser hit the coordinator directly? Because FINALIZE_TOKEN
 * is a server secret. The Attester share submissions DO go directly to the
 * coordinator (no token needed there — each submission is wallet-signed).
 *
 * Env:
 *   COORDINATOR_BASE_URL   (defaults to https://roebel-maci-coordinator.fly.dev)
 *   COORDINATOR_FINALIZE_TOKEN  (server-only — same value as Fly's FINALIZE_TOKEN)
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { founderWallet, signature, pollId, timeoutMs } = body as {
    founderWallet?: string;
    signature?: string;
    pollId?: string;
    timeoutMs?: number;
  };

  if (!founderWallet || !signature || !pollId) {
    return NextResponse.json(
      { error: "missing required fields" },
      { status: 400 }
    );
  }

  if (!verifyIsFounder(founderWallet)) {
    return NextResponse.json(
      { error: "founderWallet not on allowlist" },
      { status: 403 }
    );
  }

  const signedMessage = `Roebel DAO trigger tally session v1\npoll=${pollId}`;
  if (!(await verifyWalletSignature(signedMessage, signature, founderWallet))) {
    return NextResponse.json(
      { error: "signature does not match founderWallet" },
      { status: 401 }
    );
  }

  const coordinatorBaseUrl =
    process.env.COORDINATOR_BASE_URL ?? "https://roebel-maci-coordinator.fly.dev";
  const finalizeToken = process.env.COORDINATOR_FINALIZE_TOKEN;
  if (!finalizeToken) {
    return NextResponse.json(
      { error: "COORDINATOR_FINALIZE_TOKEN not configured on server" },
      { status: 500 }
    );
  }

  let fwRes: Response;
  try {
    fwRes = await fetch(`${coordinatorBaseUrl}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Finalize-Token": finalizeToken,
      },
      body: JSON.stringify({ pollId, timeoutMs }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `coordinator unreachable: ${String(err)}` },
      { status: 502 }
    );
  }

  const text = await fwRes.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!fwRes.ok) {
    return NextResponse.json(
      { error: "coordinator rejected", coordinator: data },
      { status: fwRes.status }
    );
  }

  // Audit log
  const supabase = createAdminClient();
  await supabase.from("coordinator_audit_log").insert({
    event_type: "session_trigger_requested",
    actor_wallet: founderWallet.toLowerCase(),
    target_id: pollId,
    payload: { pollId, timeoutMs: timeoutMs ?? null },
  });

  return NextResponse.json({ ok: true, coordinator: data });
}
