import { hashMessage, hashTypedData, recoverTypedDataAddress } from "viem";
import { makeAccountSignatureVerifier, type AccountSignatureClient } from "./account-signature-core";
import { clientFor, type ClientOpts } from "./client";

const utils = { hashMessage, hashTypedData, recoverTypedDataAddress };

/**
 * "Did this account sign this?" for every account type of the community: plain EOA,
 * ERC-1271 smart account, ERC-6492 (not yet deployed), the Safe-admin envelope of a
 * passkey or migrated account, and the thirdweb signing-domain fallback. Exactly one of
 * `message`, `typedData`, `hash`. Malformed input is `false`; an RPC failure throws.
 */
export function verifyAccountSignature(
  input: { address: string; signature: string; message?: string; typedData?: unknown; hash?: string },
  opts?: ClientOpts,
): Promise<boolean> {
  const verify = makeAccountSignatureVerifier({ client: clientFor(opts) as unknown as AccountSignatureClient, utils });
  return verify(input);
}
