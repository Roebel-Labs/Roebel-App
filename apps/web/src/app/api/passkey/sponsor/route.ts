import { NextResponse } from "next/server";
import { numberToHex, type Hex } from "viem";
import {
  ADDRESSES,
  evaluateSponsorPolicy,
  parseSponsorUserOp,
  toPackedUserOperation,
  type SponsorUserOp,
} from "@/lib/passkey/sponsor-policy";
import { issueSponsorship } from "@/lib/passkey/voucher";

/**
 * PREVIEW-ONLY sponsor for passkey Safe userOps (EntryPoint v0.7) via the live
 * NetizenVerifyingPaymaster on Gnosis. Returns a signed voucher v2 as a
 * ready-to-submit `paymasterAndData`; the client does NOT re-estimate after
 * this call - the paymaster gas limits it sent are echoed verbatim and are
 * covered by the voucher signature.
 *
 * Request:  POST { chainId: 100, userOp: { sender, nonce, factory?, factoryData?,
 *           callData, callGasLimit, verificationGasLimit, preVerificationGas,
 *           maxFeePerGas, maxPriorityFeePerGas, paymasterVerificationGasLimit,
 *           paymasterPostOpGasLimit } }   (numerics as 0x hex)
 * Response: 200 { paymasterAndData, paymasterVerificationGasLimit,
 *           paymasterPostOpGasLimit, validUntil }
 *           | 400 { error: 'bad_request' } | 403 { error: 'not_sponsorable', reason }
 *           | 503 { error: 'disabled' }
 *
 * Server-only env (set on Vercel PREVIEW only):
 *   PASSKEY_SPONSOR_ENABLED=1
 *   PASSKEY_SPONSOR_KEY=0x…   (paymaster sponsorSigner key - never logged)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAIN_ID = 100;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

const disabled = () => NextResponse.json({ error: "disabled" }, { status: 503 });
const badRequest = () => NextResponse.json({ error: "bad_request" }, { status: 400 });
const notSponsorable = (reason: string) =>
  NextResponse.json({ error: "not_sponsorable", reason }, { status: 403 });

export async function POST(request: Request) {
  if (process.env.PASSKEY_SPONSOR_ENABLED !== "1") return disabled();
  const key = process.env.PASSKEY_SPONSOR_KEY ?? "";
  if (!PRIVATE_KEY.test(key)) {
    console.error("[passkey-sponsor] enabled but PASSKEY_SPONSOR_KEY is missing or malformed");
    return disabled();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest();
  }
  if (!body || typeof body !== "object") return badRequest();
  const { chainId, userOp } = body as { chainId?: unknown; userOp?: unknown };

  let op: SponsorUserOp;
  try {
    op = parseSponsorUserOp(userOp);
  } catch {
    return badRequest();
  }

  if (chainId !== CHAIN_ID) return notSponsorable("chainId must be 100");
  const verdict = evaluateSponsorPolicy(op);
  if (!verdict.ok) return notSponsorable(verdict.reason);

  try {
    const { paymasterAndData, validUntil } = await issueSponsorship({
      op: toPackedUserOperation(op),
      privateKey: key as Hex,
      ctx: { chainId: CHAIN_ID, paymaster: ADDRESSES.paymaster },
    });
    return NextResponse.json({
      paymasterAndData,
      paymasterVerificationGasLimit: numberToHex(op.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: numberToHex(op.paymasterPostOpGasLimit),
      validUntil,
    });
  } catch (err) {
    // Never include the key; only the error class/message from signing.
    console.error("[passkey-sponsor] signing failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "sponsor_failed" }, { status: 500 });
  }
}
