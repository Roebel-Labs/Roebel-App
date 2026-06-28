import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";
import { GK_SAFE } from "@/lib/gemeinschaftskasse/constants";

export const dynamic = "force-dynamic";

/**
 * POST /api/gemeinschaftskasse/propose
 *
 * Relays a signed Safe transaction to the Safe Transaction Service so that
 * other owners can confirm it. Requires admin (attester) credentials.
 *
 * Body:
 *   safeTransactionData  – SafeTransactionData (to/value/data/operation/nonce/gas fields)
 *   safeTxHash           – the keccak256 Safe tx hash
 *   senderAddress        – the owner address that produced senderSignature
 *   senderSignature      – encoded signature bytes (ERC-1271 or EOA)
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { safeTransactionData, safeTxHash, senderAddress, senderSignature } =
      await req.json();
    const kit = getApiKit();
    await kit.proposeTransaction({
      safeAddress: GK_SAFE,
      safeTransactionData,
      safeTxHash,
      senderAddress,
      senderSignature,
    });
    return NextResponse.json({ ok: true, safeTxHash });
  } catch (e) {
    return jsonError(e);
  }
}
