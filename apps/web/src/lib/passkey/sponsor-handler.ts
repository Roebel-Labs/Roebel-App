/**
 * Request handling for POST /api/passkey/sponsor, with the chain reader
 * injected so it is testable without RPC. The Next route only wires the
 * real Gnosis reader in.
 *
 * Request:  { chainId: 100, userOp: { sender, nonce, factory?, factoryData?,
 *           callData, callGasLimit, verificationGasLimit, preVerificationGas,
 *           maxFeePerGas, maxPriorityFeePerGas, paymasterVerificationGasLimit,
 *           paymasterPostOpGasLimit } }   (numerics as 0x hex)
 * Response: 200 { paymasterAndData, paymasterVerificationGasLimit,
 *           paymasterPostOpGasLimit, validUntil }
 *           | 400 { error: 'bad_request' }
 *           | 403 { error: 'not_sponsorable', reason }
 *           | 503 { error: 'disabled' } | 503 { error: 'chain_unavailable' }
 *           | 500 { error: 'sponsor_failed' }
 */
import { NextResponse } from "next/server";
import { numberToHex, type Hex } from "viem";
import {
  ADDRESSES,
  ChainReadError,
  evaluateSponsorPolicy,
  parseSponsorUserOp,
  toPackedUserOperation,
  type ChainReader,
  type SponsorUserOp,
} from "./sponsor-policy";
import { issueSponsorship } from "./voucher";

const CHAIN_ID = 100;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

const disabled = () => NextResponse.json({ error: "disabled" }, { status: 503 });
const badRequest = () => NextResponse.json({ error: "bad_request" }, { status: 400 });
const notSponsorable = (reason: string) =>
  NextResponse.json({ error: "not_sponsorable", reason }, { status: 403 });

export async function handleSponsorRequest(request: Request, deps: { chain: ChainReader }) {
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

  try {
    const verdict = await evaluateSponsorPolicy(op, deps.chain);
    if (!verdict.ok) return notSponsorable(verdict.reason);
  } catch (err) {
    // Fail closed: no chain facts, no voucher.
    const cause = err instanceof ChainReadError && err.cause instanceof Error ? err.cause.message : "unknown";
    console.error("[passkey-sponsor] chain read failed:", cause);
    return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
  }

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
    // Never include the key; only the error message from signing.
    console.error("[passkey-sponsor] signing failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "sponsor_failed" }, { status: 500 });
  }
}
