import { MiniAppVerifyError } from "./errors";
import { verifyAccountSignature } from "./signature";
import type { ClientOpts } from "./client";

export const SIGN_IN_TOKEN_PREFIX = "nzsi1.";
export const SIGN_IN_CHAIN_ID = 100;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
/** Tolerated clock skew for an `Issued At` slightly in the future. */
const FUTURE_SKEW_SEC = 60;

function decodeToken(token: string): { address: string; message: string; signature: string } {
  if (typeof token !== "string" || !token.startsWith(SIGN_IN_TOKEN_PREFIX)) throw new MiniAppVerifyError("malformed");
  let json: unknown;
  try {
    const b64 = token.slice(SIGN_IN_TOKEN_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    json = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch {
    throw new MiniAppVerifyError("malformed");
  }
  const j = json as { address?: unknown; message?: unknown; signature?: unknown };
  if (typeof j?.address !== "string" || typeof j.message !== "string" || typeof j.signature !== "string") {
    throw new MiniAppVerifyError("malformed");
  }
  return { address: j.address, message: j.message, signature: j.signature };
}

function field(lines: string[], name: string): string | undefined {
  const prefix = `${name}: `;
  const line = lines.find((l) => l.startsWith(prefix));
  return line?.slice(prefix.length);
}

/**
 * Verifies a sign-in token from `sdk.auth.signIn()`: an EIP-4361 message on Gnosis signed by
 * the account. Checks the domain, chain id 100, the nonce (when given), the age of `Issued At`
 * (default 300 s), that the message names the token's address, then the account signature.
 * Returns the account address; throws `MiniAppVerifyError` otherwise.
 */
export async function verifySignIn(
  token: string,
  opts: { domain: string; nonce?: string; maxAgeSec?: number } & ClientOpts,
): Promise<{ address: string }> {
  const t = decodeToken(token);
  if (!ADDRESS_RE.test(t.address)) throw new MiniAppVerifyError("malformed");
  const lines = t.message.split("\n");
  const head = /^(\S+) wants you to sign in with your Ethereum account:$/.exec(lines[0] ?? "");
  if (!head) throw new MiniAppVerifyError("malformed");
  if (head[1] !== opts.domain) throw new MiniAppVerifyError("wrong_domain");
  if ((lines[1] ?? "").toLowerCase() !== t.address.toLowerCase()) throw new MiniAppVerifyError("malformed");
  if (field(lines, "Chain ID") !== String(SIGN_IN_CHAIN_ID)) throw new MiniAppVerifyError("wrong_chain");
  if (opts.nonce !== undefined && field(lines, "Nonce") !== opts.nonce) throw new MiniAppVerifyError("wrong_nonce");
  const issuedAt = Date.parse(field(lines, "Issued At") ?? "");
  if (!Number.isFinite(issuedAt)) throw new MiniAppVerifyError("malformed");
  const ageSec = (Date.now() - issuedAt) / 1000;
  if (ageSec > (opts.maxAgeSec ?? 300) || ageSec < -FUTURE_SKEW_SEC) throw new MiniAppVerifyError("expired");
  const ok = await verifyAccountSignature({ address: t.address, signature: t.signature, message: t.message }, opts);
  if (!ok) throw new MiniAppVerifyError("bad_signature");
  return { address: t.address };
}
