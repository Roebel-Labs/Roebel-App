/**
 * Server-side "did this account sign this?" for the web app. The rule lives in
 * ./account-signature-core.ts (shared verbatim with the Supabase edge
 * functions): (a) viem universal verification (EOA / ERC-1271 / ERC-6492) on
 * Gnosis, OR (b) a Safe-admin envelope signed by a passkey Safe that is the
 * account or an admin of it, OR (c) a thirdweb Account signature made under the
 * chainId 100 or 8453 domain by a current admin.
 *
 * Throws on RPC transport failure; callers keep their own error mapping.
 * No next/* imports, so framework-agnostic modules can use it.
 */
import { createPublicClient, hashMessage, hashTypedData, http, recoverTypedDataAddress, type PublicClient } from "viem";
import { gnosis } from "viem/chains";
import {
  makeAccountSignatureVerifier,
  type AccountSignatureClient,
  type AccountSignatureInput,
  type VerifyAccountSignature,
} from "./account-signature-core";

export {
  SAFE_ADMIN_SIGNATURE_MAGIC,
  decodeSafeAdminSignature,
  encodeSafeAdminSignature,
  type AccountSignatureInput,
} from "./account-signature-core";

export const accountSignatureUtils = { hashMessage, hashTypedData, recoverTypedDataAddress };

/** A verifier bound to an existing viem public client on Gnosis (keeps each caller's RPC choice). */
export function createAccountSignatureVerifier(client: PublicClient | AccountSignatureClient): VerifyAccountSignature {
  return makeAccountSignatureVerifier({ client: client as AccountSignatureClient, utils: accountSignatureUtils });
}

let fallback: VerifyAccountSignature | null = null;

/** Default verifier on GNOSIS_RPC_URL (or the public Gnosis RPC). */
export function verifyAccountSignature(input: AccountSignatureInput & { chain?: "gnosis" }): Promise<boolean> {
  fallback ??= createAccountSignatureVerifier(
    createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com") }),
  );
  const { chain: _chain, ...rest } = input;
  return fallback(rest);
}
