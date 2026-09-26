import { createGnosisChainReader } from "@/lib/passkey/chain-reader";
import type { ChainReader } from "@/lib/passkey/sponsor-policy";
import { handleSponsorRequest } from "@/lib/passkey/sponsor-handler";

/**
 * PREVIEW-ONLY sponsor for passkey Safe userOps (EntryPoint v0.7) via the live
 * NetizenVerifyingPaymaster on Gnosis. Returns a signed voucher v2 as a
 * ready-to-submit `paymasterAndData`; the client does NOT re-estimate after
 * this call - the paymaster gas limits it sent are echoed verbatim and are
 * covered by the voucher signature. Only the sender's OWN legacy thirdweb
 * account can be driven (see lib/passkey/sponsor-policy.ts). Contract and
 * responses: lib/passkey/sponsor-handler.ts.
 *
 * Server-only env (set on Vercel PREVIEW only):
 *   PASSKEY_SPONSOR_ENABLED=1
 *   PASSKEY_SPONSOR_KEY=0x…   (paymaster sponsorSigner key - never logged)
 *   GNOSIS_RPC_URL=…          (optional; default https://gnosis-rpc.publicnode.com)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let chain: ChainReader | null = null;

export async function POST(request: Request) {
  chain ??= createGnosisChainReader();
  return handleSponsorRequest(request, { chain });
}
