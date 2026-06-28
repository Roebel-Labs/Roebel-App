import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";

export const dynamic = "force-dynamic";

/**
 * POST /api/gemeinschaftskasse/confirm
 *
 * Adds a confirmation (signature) to an existing pending Safe transaction.
 * Requires admin (attester) credentials.
 *
 * Body:
 *   safeTxHash  – the Safe tx hash of the pending transaction
 *   signature   – the owner's encoded signature bytes
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { safeTxHash, signature } = await req.json();
    const kit = getApiKit();
    await kit.confirmTransaction(safeTxHash, signature);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
