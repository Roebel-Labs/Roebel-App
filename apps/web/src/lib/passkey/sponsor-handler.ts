/**
 * Request handling for POST /api/passkey/sponsor, with the chain reader and
 * the budget injected so it is testable without RPC. The Next route only
 * wires the real Gnosis reader and the in-memory budget in.
 *
 * Request:  { chainId: 100,
 *             x, y,       // passkey P-256 public key, 0x + 32 bytes each
 *             legacy?,    // the citizen's legacy thirdweb account (the ONE account the op may drive);
 *                         // omitted when the sender Safe itself is the citizen, or for recovery ops
 *             recoveryLegacy?, // recovery ops: the legacy account the recovered wallet administers
 *             userOp: { sender, nonce, factory?, factoryData?, callData,
 *               callGasLimit, verificationGasLimit, preVerificationGas,
 *               maxFeePerGas, maxPriorityFeePerGas,
 *               paymasterVerificationGasLimit, paymasterPostOpGasLimit } }
 *           (numerics as 0x hex)
 * Response: 200 { paymasterAndData, paymasterVerificationGasLimit,
 *           paymasterPostOpGasLimit, validUntil }
 *           | 400 { error: 'bad_request' }
 *           | 403 { error: 'not_sponsorable', reason }
 *           | 429 { error: 'budget_exhausted' }
 *           | 503 { error: 'disabled' } | 503 { error: 'chain_unavailable' }
 *           | 500 { error: 'sponsor_failed' }
 *
 * Env (server-only):
 *   PASSKEY_SPONSOR_ENABLED=1
 *   PASSKEY_SPONSOR_KEY        sponsorSigner key of the preview paymaster (never logged)
 *   PASSKEY_PAYMASTER_ADDRESS  the DEDICATED preview paymaster; required, no default
 *   PASSKEY_CITIZEN_NFT_V3     optional; CitizenNFTv3 (citizen check + moveTo target). Unset = v3 off
 *   PASSKEY_ATTESTER_NFT_V3    optional; AttesterNFTv3 (moveTo target). Unset = attester moveTo off
 *
 * Logging: never a raw error message (viem errors can embed the RPC URL with
 * an API key). A fixed string plus the error's `name` only.
 */
import { NextResponse } from "next/server";
import { isAddress, numberToHex, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import {
  ChainReadError,
  evaluateSponsorPolicy,
  parseSponsorRequest,
  toPackedUserOperation,
  type ChainReader,
  type V3Config,
} from "./sponsor-policy";
import type { SponsorBudget } from "./sponsor-budget";
import { issueSponsorship, requiredPrefund } from "./voucher";

const CHAIN_ID = 100;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

/** Sponsor signers that must never sign passkey vouchers: the Netizen Accounts
 * production signer (NetizenVerifyingPaymaster 0x11ed…'s sponsorSigner). */
export const PRODUCTION_SPONSOR_SIGNERS: readonly Hex[] = ["0x218B0a592f2078Aa542d7B981638595DF6bA8bF7"];

const disabled = () => NextResponse.json({ error: "disabled" }, { status: 503 });
const badRequest = () => NextResponse.json({ error: "bad_request" }, { status: 400 });
const notSponsorable = (reason: string) =>
  NextResponse.json({ error: "not_sponsorable", reason }, { status: 403 });

function errName(err: unknown): string {
  const inner = err instanceof ChainReadError ? err.cause : err;
  return inner instanceof Error ? inner.name : typeof inner;
}

/** Validated config, or null (logged) when the route must stay off. */
function readConfig(): { key: Hex; paymaster: Hex } | null {
  if (process.env.PASSKEY_SPONSOR_ENABLED !== "1") return null;
  const key = process.env.PASSKEY_SPONSOR_KEY ?? "";
  if (!PRIVATE_KEY.test(key)) {
    console.error("[passkey-sponsor] enabled but PASSKEY_SPONSOR_KEY is missing or malformed");
    return null;
  }
  const paymaster = process.env.PASSKEY_PAYMASTER_ADDRESS ?? "";
  if (!isAddress(paymaster, { strict: false })) {
    console.error("[passkey-sponsor] enabled but PASSKEY_PAYMASTER_ADDRESS is missing or malformed");
    return null;
  }
  const signer = privateKeyToAddress(key as Hex).toLowerCase();
  if (PRODUCTION_SPONSOR_SIGNERS.some((a) => a.toLowerCase() === signer)) {
    console.error("[passkey-sponsor] refusing the production sponsor signer; use a dedicated preview paymaster");
    return null;
  }
  return { key: key as Hex, paymaster: paymaster as Hex };
}

/** Optional v3 contracts; a malformed value is logged and treated as unset (v3 shapes rejected). */
export function v3ConfigFromEnv(env: Record<string, string | undefined> = process.env): V3Config {
  const pick = (name: string): Hex | undefined => {
    const v = env[name];
    if (!v) return undefined;
    if (!isAddress(v, { strict: false })) {
      console.error(`[passkey-sponsor] ${name} is malformed; v3 stays off`);
      return undefined;
    }
    return v as Hex;
  };
  return { citizenNft: pick("PASSKEY_CITIZEN_NFT_V3"), attesterNft: pick("PASSKEY_ATTESTER_NFT_V3") };
}

export async function handleSponsorRequest(
  request: Request,
  deps: { chain: ChainReader; budget: SponsorBudget },
) {
  if (process.env.PASSKEY_SPONSOR_ENABLED !== "1") return disabled();
  const config = readConfig();
  if (!config) return disabled();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest();
  }
  let parsed: ReturnType<typeof parseSponsorRequest>;
  try {
    parsed = parseSponsorRequest(raw);
  } catch {
    return badRequest();
  }
  const { userOp: op, x, y, legacy, recoveryLegacy } = parsed;
  if (parsed.chainId !== CHAIN_ID) return notSponsorable("chainId must be 100");

  let budgetKey: Hex;
  try {
    const verdict = await evaluateSponsorPolicy(
      op,
      { x, y, legacy, recoveryLegacy, nowSeconds: Math.floor(Date.now() / 1000), v3: v3ConfigFromEnv() },
      deps.chain,
    );
    if (!verdict.ok) return notSponsorable(verdict.reason);
    budgetKey = verdict.budgetKey;
  } catch (err) {
    // Fail closed: no chain facts, no voucher.
    console.error("[passkey-sponsor] chain read failed:", errName(err));
    return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
  }

  const packed = toPackedUserOperation(op);
  try {
    const reserved = await deps.budget.reserve(budgetKey.toLowerCase(), requiredPrefund(packed));
    if (!reserved) return NextResponse.json({ error: "budget_exhausted" }, { status: 429 });
  } catch (err) {
    console.error("[passkey-sponsor] budget unavailable:", errName(err));
    return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
  }

  try {
    const { paymasterAndData, validUntil } = await issueSponsorship({
      op: packed,
      privateKey: config.key,
      ctx: { chainId: CHAIN_ID, paymaster: config.paymaster },
    });
    return NextResponse.json({
      paymasterAndData,
      paymasterVerificationGasLimit: numberToHex(op.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: numberToHex(op.paymasterPostOpGasLimit),
      validUntil,
    });
  } catch (err) {
    console.error("[passkey-sponsor] signing failed:", errName(err));
    return NextResponse.json({ error: "sponsor_failed" }, { status: 500 });
  }
}
