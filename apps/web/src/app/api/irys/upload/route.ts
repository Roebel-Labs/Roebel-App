import { NextRequest } from "next/server";
import NodeIrys from "@irys/sdk";
import { handleIrysUpload, IRYS_UPLOAD_RATE_RULES } from "@/lib/irys/upload-handler";
import { verifyWalletSignature } from "@/lib/signed-request/signature";
import { sharedLimiters } from "@/lib/rate-limit/server";

export const runtime = "nodejs";

const limiters = sharedLimiters(IRYS_UPLOAD_RATE_RULES);

/**
 * POST /api/irys/upload
 *
 * Server-side Irys upload with a dedicated EOA (IRYS_UPLOAD_PRIVATE_KEY, server env only).
 * Body: { content, tags, userAddress, auth: { timestampSec, signature } } — the signature is
 * userAddress's signature over lib/irys/upload-message.ts. Rate-limited per wallet.
 */
export async function POST(request: NextRequest) {
  const key = process.env.IRYS_UPLOAD_PRIVATE_KEY;
  return handleIrysUpload(request, {
    verifySignature: verifyWalletSignature,
    limiters,
    hasKey: !!key,
    upload: async (content, tags) => {
      // Base L2 ETH funds the Irys node balance ("base-eth").
      const irys = new NodeIrys({ network: "mainnet", token: "base-eth", key: key! });
      const receipt = await irys.upload(content, { tags });
      return { id: receipt.id, timestamp: receipt.timestamp, version: receipt.version };
    },
  });
}
