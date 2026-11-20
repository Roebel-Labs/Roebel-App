import { createGnosisChainReader } from "@/lib/passkey/chain-reader";
import { budgetFromEnv, type SponsorBudget } from "@/lib/passkey/sponsor-budget";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChainReader } from "@/lib/passkey/sponsor-policy";
import { handleSponsorRequest, type MiniAppSponsorDeps } from "@/lib/passkey/sponsor-handler";
import { miniAppGasBudgetFromEnv } from "@/lib/passkey/miniapp-gas-budget";

/**
 * PREVIEW-ONLY sponsor for passkey Safe userOps (EntryPoint v0.7). Returns a
 * signed voucher v2 for a DEDICATED preview NetizenVerifyingPaymaster as a
 * ready-to-submit `paymasterAndData`; the client does NOT re-estimate after
 * this call - the paymaster gas limits it sent are echoed verbatim and are
 * covered by the voucher signature.
 *
 * Only a genuine passkey Safe for the request's (x, y) acting for a citizen
 * identity is sponsored: its own `legacy` thirdweb account, the Safe itself
 * (after a v3 moveTo), or a citizen wallet it helps recover - see
 * lib/passkey/sponsor-policy.ts for the rules and
 * lib/passkey/sponsor-handler.ts for the request/response contract.
 *
 * BUDGET: PASSKEY_SPONSOR_BUDGET_STORE=supabase uses the shared Postgres
 * budget (atomic RPC passkey_sponsor_reserve_v2, migrations
 * 20260927_passkey_sponsor_budget.sql + 20261117a_passkey_sponsor_guest_cap.sql). Unset = the in-memory budget, which is
 * PREVIEW-ONLY: it resets on every cold start and is per serverless instance,
 * so the real ceiling is caps x instances.
 *
 * Server-only env (set on Vercel PREVIEW only):
 *   PASSKEY_SPONSOR_ENABLED=1
 *   PASSKEY_SPONSOR_KEY=0x…          (preview paymaster's sponsorSigner key - never logged;
 *                                     the Netizen Accounts production signer is refused)
 *   PASSKEY_PAYMASTER_ADDRESS=0x…    (required; the dedicated preview paymaster)
 *   PASSKEY_SPONSOR_DAILY_WEI        (optional; per identity per UTC day, default 0.01 xDAI;
 *                                     identity = legacy account, citizen Safe, or the wallet being recovered)
 *   PASSKEY_SPONSOR_GLOBAL_DAILY_WEI (optional; all accounts per UTC day, default 0.05 xDAI)
 *   PASSKEY_SPONSOR_ONBOARDING_DAILY_WEI (optional; per guest (non-citizen) Safe, default 0.002 xDAI;
 *                                     too low for a guest's first op: set ~0.006 xDAI before opening sign-up)
 *   PASSKEY_SPONSOR_GUEST_GLOBAL_DAILY_WEI (optional; all guest Safes together per UTC day, default 0.02 xDAI;
 *                                     keep it BELOW PASSKEY_SPONSOR_GLOBAL_DAILY_WEI, guests count there too)
 *   PASSKEY_SPONSOR_BUDGET_STORE=supabase (optional; needs both migrations + SUPABASE_SERVICE_ROLE_KEY)
 *   PASSKEY_CITIZEN_NFT_V3=0x…       (optional; CitizenNFTv3 - citizen check + moveTo target; unset = v3 off)
 *   PASSKEY_ATTESTER_NFT_V3=0x…      (optional; AttesterNFTv3 - moveTo target)
 *   GNOSIS_RPC_URL=…                 (optional; default https://gnosis-rpc.publicnode.com)
 *   MINIAPP_GAS_PER_PERSON_DAILY_WEI (optional; mini-app ops, per person per UTC day, default 0.003 xDAI)
 *   MINIAPP_GAS_GLOBAL_DAILY_WEI     (optional; all mini-app ops per UTC day, default 0.05 xDAI)
 *
 * MINI APPS: a body with `miniApp` (uuid) is sponsored only for that app's declared calls
 * (live, manifest version 2, contracts reviewed) and charged to the mini-app gas budget
 * (migration 20261117mb_mini_app_contracts_gas.sql; with the in-memory store the granted
 * budget is read per request and the spend is counted per instance), never the budget above.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let chain: ChainReader | null = null;
let budget: SponsorBudget | null = null;
let miniApps: MiniAppSponsorDeps | null = null;
/** Granted budgets seen by `rules`, for the in-memory store (the Supabase store reads the row itself). */
const appBudgets = new Map<string, bigint>();

const makeAdminClient = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null;

export async function POST(request: Request) {
  chain ??= createGnosisChainReader();
  budget ??= budgetFromEnv(process.env, undefined, makeAdminClient);
  miniApps ??= {
    rules: async (id) => {
      // Loaded lazily: the mini-app data layer is server-only and only needed for mini-app requests.
      const { getSponsorableMiniApp } = await import("@/lib/miniapp/data");
      const app = await getSponsorableMiniApp(id);
      if (!app) return null;
      appBudgets.set(id, app.gasBudgetWei);
      return app.rules;
    },
    budget: miniAppGasBudgetFromEnv(process.env, makeAdminClient, (id) => appBudgets.get(id) ?? 0n),
  };
  return handleSponsorRequest(request, { chain, budget, miniApps });
}
