import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";
import { assembleSenderSignature } from "@/lib/gemeinschaftskasse/safe-server";
import { GK_SAFE } from "@/lib/gemeinschaftskasse/constants";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { safeTransactionData, safeTxHash, inner, ownerAddress, isSmart } =
      await req.json();
    const senderSignature = await assembleSenderSignature({
      inner,
      ownerAddress,
      isSmart,
    });
    const kit = getApiKit();
    await kit.proposeTransaction({
      safeAddress: GK_SAFE,
      safeTransactionData,
      safeTxHash,
      senderAddress: ownerAddress,
      senderSignature,
    });
    return NextResponse.json({ ok: true, safeTxHash });
  } catch (e) {
    return jsonError(e);
  }
}
