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

    // DIAGNOSTIC: log the exact inputs so we can reproduce the tx-service
    // rejection out of band (the SafeApiKit error below only carries the HTTP
    // status text, not the validation body).
    console.log(
      "[gk/confirm] inputs " +
        JSON.stringify({
          safeTxHash,
          ownerAddress,
          isSmart,
          innerLen: typeof inner === "string" ? inner.length : null,
          inner,
          sigLen: typeof signature === "string" ? signature.length : null,
          signature,
        }),
    );

    const kit = getApiKit();
    try {
      await kit.confirmTransaction(safeTxHash, signature);
    } catch (apiErr) {
      const e = apiErr as Record<string, unknown> & { message?: string };
      let full = "";
      try {
        full = JSON.stringify(apiErr, Object.getOwnPropertyNames(apiErr ?? {}));
      } catch {
        full = String(apiErr);
      }
      console.error(
        "[gk/confirm] confirmTransaction failed " +
          JSON.stringify({
            message: e?.message,
            body:
              (e?.response as { data?: unknown })?.data ??
              e?.data ??
              e?.body ??
              null,
            full,
          }),
      );
      // Re-throw with a richer message so the client surfaces it too.
      throw new Error(
        "Safe-Service: " + (e?.message ?? "unbekannter Fehler"),
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
