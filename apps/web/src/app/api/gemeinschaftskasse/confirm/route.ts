import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getApiKit } from "@/lib/gemeinschaftskasse/api-kit";
import { assembleSenderSignature } from "@/lib/gemeinschaftskasse/safe-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { safeTxHash, inner, ownerAddress, isSmart } = await req.json();
    const signature = await assembleSenderSignature({
      inner,
      ownerAddress,
      isSmart,
    });
    const kit = getApiKit();
    await kit.confirmTransaction(safeTxHash, signature);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
