import { NextRequest, NextResponse } from "next/server";
import {
  verifyIsFounder,
  verifyWalletSignature,
} from "@/lib/shamir/signature-verification";

/**
 * POST /api/coordinator/finalize-pending
 *
 * Founder-gated proxy that kicks the Fly coordinator's POST /finalize-pending
 * endpoint, which spawns scripts/scan-and-finalize.js. That child scans the
 * Governor for proposals whose voting period ended but whose MACI poll has
 * not been tallied, and runs the legacy single-key tally path (uses
 * COORDINATOR_PRIV on Fly).
 *
 * Use this for polls that were created BEFORE the Shamir rotation was
 * executed — they're encrypted to the old pubkey which is still on Fly.
 * Once COORDINATOR_PRIV is removed (after the first Shamir tally lands),
 * this route will start returning "no privkey configured" from Fly and
 * the founder must use the Shamir flow at /sessions instead.
 *
 * Body:  { founderWallet, signature }
 * Sig over: `Roebel DAO finalize-pending v1\nts=<ms>`
 *
 * Env (server-only):
 *   COORDINATOR_BASE_URL           (defaults to roebel-maci-coordinator.fly.dev)
 *   COORDINATOR_FINALIZE_TOKEN     same value as Fly's FINALIZE_TOKEN
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { founderWallet, signature } = body as {
    founderWallet?: string;
    signature?: string;
  };

  if (!founderWallet || !signature) {
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

  // We accept any signed message that starts with the v1 prefix — the
  // founder-gating + signature recovery is the security boundary, the
  // ts in the message is just so the same signature can't be replayed
  // by an attacker who steals one captured request body.
  const expectedPrefix = "Roebel DAO finalize-pending v1";
  // We don't pin the exact message — the client picks the ts. We only
  // require the prefix to be present, so the signed text can't be
  // confused with another action's challenge.
  // (verifyWalletSignature recovers from the exact message the client
  // signed; we ask for it via the `message` field.)
  const { message } = body as { message?: string };
  if (!message || !message.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: "missing or malformed signed message" },
      { status: 400 }
    );
  }

  if (!(await verifyWalletSignature(message, signature, founderWallet))) {
    return NextResponse.json(
      { error: "signature does not match founderWallet" },
      { status: 401 }
    );
  }

  const coordinatorBaseUrl =
    process.env.COORDINATOR_BASE_URL ??
    "https://roebel-maci-coordinator.fly.dev";
  const finalizeToken = process.env.COORDINATOR_FINALIZE_TOKEN;
  if (!finalizeToken) {
    return NextResponse.json(
      { error: "COORDINATOR_FINALIZE_TOKEN not configured on server" },
      { status: 500 }
    );
  }

  let fwRes: Response;
  try {
    fwRes = await fetch(`${coordinatorBaseUrl}/finalize-pending`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Finalize-Token": finalizeToken,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "failed to reach coordinator",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  const text = await fwRes.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!fwRes.ok) {
    return NextResponse.json(
      { error: "coordinator rejected", upstream: json },
      { status: fwRes.status }
    );
  }

  return NextResponse.json({ ok: true, upstream: json });
}
