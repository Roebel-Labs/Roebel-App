/**
 * Request handling for the optional passkey warning email (PREVIEW-ONLY), with store, chain
 * verifier, mailer and rate limits injected. The Next routes only wire the real ones in.
 *
 *   POST /api/passkey/email/start  { safe, email, proof: { timestamp, signature } }
 *        proof = ERC-1271 signature by the passkey Safe over buildEmailProofMessage('add', ...)
 *        -> 200 { ok, expiresAt } and a 6-digit code to `email`
 *   POST /api/passkey/email/verify { safe, code }  -> 200 { ok, verified: true }
 *   POST /api/passkey/email/remove { safe, proof: { timestamp, signature } }   ('remove' text)
 *        -> 200 { ok }
 *
 * Errors: 400 bad_request | invalid_code | code_expired, 401 bad_proof | proof_expired,
 * 409 safe_not_deployed | proof_used, 429 rate_limited | too_many_attempts,
 * 502 send_failed, 503 disabled | chain_unavailable | store_unavailable.
 *
 * Counterfactual Safes: refused (409 safe_not_deployed), not ERC-6492. Every migrated passkey Safe
 * is deployed by its first (handover) op, and an undeployed Safe has no guardians, so there is no
 * recovery to warn about yet.
 *
 * The email is NEVER a login or a key. It is stored apart from `users.email` (passkey_contacts),
 * so the newsletter auto-enroll trigger on `users` never sees it.
 *
 * Logging: fixed strings plus an error `name` only. Never the email, the code or an RPC URL.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { buildEmailProofMessage, isProofFresh, normalizeEmail, PROOF_MAX_SKEW_SEC } from "./email-proof";
import type { PasskeyEmailStore } from "./email-store";
import { verificationCodeMail, type Mailer } from "./email-mailer";
import type { RateLimiter } from "./email-rate-limit";

export const CODE_TTL_SEC = 600;
export const MAX_CODE_ATTEMPTS = 5;
const MAX_SIGNATURE_BYTES = 4096;

export interface SafeProofVerifier {
  isDeployed(safe: Address): Promise<boolean>;
  /** ERC-1271 `isValidSignature(hashMessage(message), signature)` on the Safe (viem verifyMessage). */
  verifyMessage(safe: Address, message: string, signature: Hex): Promise<boolean>;
}

export type EmailRouteDeps = {
  enabled: boolean;
  store: PasskeyEmailStore;
  verifier: SafeProofVerifier;
  mailer: Mailer;
  limits: { safe: RateLimiter; email: RateLimiter };
  nowSec: () => number;
  randomCode?: () => string;
};

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const err = (error: string, status: number) => json({ error }, status);

const errName = (e: unknown) => (e instanceof Error ? e.name : typeof e);

export function hashCode(safe: string, code: string): string {
  return createHash("sha256").update(`passkey-email-code:v1:${safe.toLowerCase()}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

const defaultCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseSafe(v: unknown): Address | null {
  return typeof v === "string" && isAddress(v, { strict: false }) ? (v.toLowerCase() as Address) : null;
}

function parseProof(v: unknown): { timestamp: number; signature: Hex } | null {
  if (!v || typeof v !== "object") return null;
  const { timestamp, signature } = v as Record<string, unknown>;
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) return null;
  if (typeof signature !== "string" || !isHex(signature, { strict: true }) || signature.length < 4) return null;
  if ((signature.length - 2) / 2 > MAX_SIGNATURE_BYTES || signature.length % 2 !== 0) return null;
  return { timestamp, signature: signature as Hex };
}

/** Checks freshness, deployment and the ERC-1271 signature; a Response on failure. */
async function checkProof(
  deps: EmailRouteDeps,
  safe: Address,
  proof: { timestamp: number; signature: Hex },
  message: string,
): Promise<NextResponse | null> {
  if (!isProofFresh(proof.timestamp, deps.nowSec())) return err("proof_expired", 401);
  try {
    if (!(await deps.verifier.isDeployed(safe))) return err("safe_not_deployed", 409);
    if (!(await deps.verifier.verifyMessage(safe, message, proof.signature))) return err("bad_proof", 401);
  } catch (e) {
    console.error("[passkey-email] chain check failed:", errName(e));
    return err("chain_unavailable", 503);
  }
  return null;
}

const proofKey = (signature: Hex) => createHash("sha256").update(signature.toLowerCase()).digest("hex");
const emailKey = (email: string) => createHash("sha256").update(`passkey-email-rl:${email}`).digest("hex");

export async function handleEmailStart(req: Request, deps: EmailRouteDeps): Promise<NextResponse> {
  if (!deps.enabled) return err("disabled", 503);
  const body = await readBody(req);
  const safe = parseSafe(body?.safe);
  const email = normalizeEmail(body?.email);
  const proof = parseProof(body?.proof);
  if (!safe || !email || !proof) return err("bad_request", 400);

  const message = buildEmailProofMessage({ action: "add", safe, email, timestamp: proof.timestamp });
  const bad = await checkProof(deps, safe, proof, message);
  if (bad) return bad;

  // Email first: a refused address must not burn the Safe's quota.
  if (!deps.limits.email.take(emailKey(email)) || !deps.limits.safe.take(safe)) return err("rate_limited", 429);

  const now = deps.nowSec();
  const code = (deps.randomCode ?? defaultCode)();
  const expiresAt = now + CODE_TTL_SEC;
  try {
    if (!(await deps.store.consumeProof(proofKey(proof.signature), proof.timestamp + PROOF_MAX_SKEW_SEC + 60))) {
      return err("proof_used", 409);
    }
    await deps.store.putChallenge({ safe, email, codeHash: hashCode(safe, code), expiresAt, attempts: 0 });
  } catch (e) {
    console.error("[passkey-email] store failed:", errName(e));
    return err("store_unavailable", 503);
  }

  try {
    await deps.mailer.send(verificationCodeMail(email, code));
  } catch (e) {
    console.error("[passkey-email] code mail failed:", errName(e));
    await deps.store.deleteChallenge(safe).catch(() => undefined);
    return err("send_failed", 502);
  }
  return json({ ok: true, expiresAt });
}

export async function handleEmailVerify(req: Request, deps: EmailRouteDeps): Promise<NextResponse> {
  if (!deps.enabled) return err("disabled", 503);
  const body = await readBody(req);
  const safe = parseSafe(body?.safe);
  const code = typeof body?.code === "string" && /^\d{6}$/.test(body.code) ? body.code : null;
  if (!safe || !code) return err("bad_request", 400);

  try {
    const ch = await deps.store.getChallenge(safe);
    if (!ch) return err("invalid_code", 400);
    if (ch.expiresAt < deps.nowSec()) {
      await deps.store.deleteChallenge(safe);
      return err("code_expired", 400);
    }
    if (ch.attempts >= MAX_CODE_ATTEMPTS) {
      await deps.store.deleteChallenge(safe);
      return err("too_many_attempts", 429);
    }
    if (!sameHash(hashCode(safe, code), ch.codeHash)) {
      await deps.store.setChallengeAttempts(safe, ch.attempts + 1);
      return err("invalid_code", 400);
    }
    await deps.store.saveVerifiedContact(safe, ch.email, deps.nowSec());
    await deps.store.deleteChallenge(safe);
  } catch (e) {
    console.error("[passkey-email] store failed:", errName(e));
    return err("store_unavailable", 503);
  }
  return json({ ok: true, verified: true });
}

export async function handleEmailRemove(req: Request, deps: EmailRouteDeps): Promise<NextResponse> {
  if (!deps.enabled) return err("disabled", 503);
  const body = await readBody(req);
  const safe = parseSafe(body?.safe);
  const proof = parseProof(body?.proof);
  if (!safe || !proof) return err("bad_request", 400);

  const message = buildEmailProofMessage({ action: "remove", safe, timestamp: proof.timestamp });
  const bad = await checkProof(deps, safe, proof, message);
  if (bad) return bad;

  try {
    if (!(await deps.store.consumeProof(proofKey(proof.signature), proof.timestamp + PROOF_MAX_SKEW_SEC + 60))) {
      return err("proof_used", 409);
    }
    await deps.store.deleteContact(safe);
    await deps.store.deleteChallenge(safe);
  } catch (e) {
    console.error("[passkey-email] store failed:", errName(e));
    return err("store_unavailable", 503);
  }
  return json({ ok: true });
}
