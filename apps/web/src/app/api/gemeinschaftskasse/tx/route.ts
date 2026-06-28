import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";

export const dynamic = "force-dynamic";

/**
 * GET /api/gemeinschaftskasse/tx?safeTxHash=<hash>
 *
 * Returns the raw Safe Transaction Service response for a given safeTxHash,
 * shaped for client-side reassembly + execution via executeFromService().
 */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const safeTxHash = searchParams.get("safeTxHash");
    if (!safeTxHash) {
      return NextResponse.json({ error: "safeTxHash fehlt" }, { status: 400 });
    }
    const kit = getApiKit();
    const raw = await kit.getTransaction(safeTxHash);
    return NextResponse.json({
      to: raw.to,
      value: raw.value,
      data: raw.data ?? "0x",
      operation: raw.operation,
      safeTxGas: raw.safeTxGas,
      baseGas: raw.baseGas,
      gasPrice: raw.gasPrice,
      gasToken: raw.gasToken,
      refundReceiver: raw.refundReceiver ?? "0x0000000000000000000000000000000000000000",
      nonce: raw.nonce,
      // confirmations: [{ owner, signature, signatureType }]
      confirmations: (raw.confirmations ?? []).map((c) => ({
        owner: c.owner,
        signature: c.signature,
        signatureType: c.signatureType,
      })),
      confirmationsRequired: raw.confirmationsRequired,
      isExecuted: raw.isExecuted,
    });
  } catch (e) {
    return jsonError(e);
  }
}
