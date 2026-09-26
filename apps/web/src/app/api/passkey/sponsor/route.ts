import { createGnosisChainReader } from "@/lib/passkey/chain-reader";
import { budgetFromEnv, type SponsorBudget } from "@/lib/passkey/sponsor-budget";
import type { ChainReader } from "@/lib/passkey/sponsor-policy";
import { handleSponsorRequest } from "@/lib/passkey/sponsor-handler";

/**
 * PREVIEW-ONLY sponsor for passkey Safe userOps (EntryPoint v0.7). Returns a
 * signed voucher v2 for a DEDICATED preview NetizenVerifyingPaymaster as a
 * ready-to-submit `paymasterAndData`; the client does NOT re-estimate after
 * this call - the paymaster gas limits it sent are echoed verbatim and are
 * covered by the voucher signature.
 *
 * Only a genuine passkey Safe for the request's (x, y), driving ONLY the
 * request's own `legacy` thirdweb account (a CitizenNFTv2 holder) is
 * sponsored - see lib/passkey/sponsor-policy.ts for the rules and
 * lib/passkey/sponsor-handler.ts for the request/response contract.
 *
 * BUDGET: the in-memory budget below is PREVIEW-ONLY. It resets on every cold
 * start and is per serverless instance, so the real ceiling is caps x
 * instances. A persistent, shared budget is a production gate.
 *
 * Server-only env (set on Vercel PREVIEW only):
 *   PASSKEY_SPONSOR_ENABLED=1
 *   PASSKEY_SPONSOR_KEY=0x…          (preview paymaster's sponsorSigner key - never logged;
 *                                     the Netizen Accounts production signer is refused)
 *   PASSKEY_PAYMASTER_ADDRESS=0x…    (required; the dedicated preview paymaster)
 *   PASSKEY_SPONSOR_DAILY_WEI        (optional; per legacy account per UTC day, default 0.01 xDAI)
 *   PASSKEY_SPONSOR_GLOBAL_DAILY_WEI (optional; all accounts per UTC day, default 0.05 xDAI)
 *   GNOSIS_RPC_URL=…                 (optional; default https://gnosis-rpc.publicnode.com)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let chain: ChainReader | null = null;
let budget: SponsorBudget | null = null;

export async function POST(request: Request) {
  chain ??= createGnosisChainReader();
  budget ??= budgetFromEnv();
  return handleSponsorRequest(request, { chain, budget });
}
