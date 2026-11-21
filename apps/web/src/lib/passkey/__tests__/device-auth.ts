/**
 * Test helper (not a test file): the device session key's `deviceAuth` for a sponsor request body
 * (security review M-1). The key is the session-keys vector's public test key.
 */
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deviceSessionAuthHash } from "../session-keys-builders";
import { parseSponsorUserOp, toPackedUserOperation } from "../sponsor-policy";
import { hashStableFields } from "../voucher";

export const DEVICE_PK = "0x0000000000000000000000000000000000000000000000000000000005e5510e" as Hex;
export const DEVICE = privateKeyToAccount(DEVICE_PK);
export const DEVICE_SIGNER = DEVICE.address as Hex;

/** deviceAuth for an RPC-shaped userOp (hex quantities), signed by `pk` (default the device key). */
export async function deviceAuthFor(
  rpcUserOp: unknown,
  o: { pk?: Hex; expiresAt?: number } = {},
): Promise<{ expiresAt: number; signature: Hex }> {
  const expiresAt = o.expiresAt ?? Math.floor(Date.now() / 1000) + 120;
  const hash = deviceSessionAuthHash({
    chainId: 100,
    stableFieldsHash: hashStableFields(toPackedUserOperation(parseSponsorUserOp(rpcUserOp))),
    expiresAt,
  });
  const signer = o.pk ? privateKeyToAccount(o.pk) : DEVICE;
  return { expiresAt, signature: await signer.signMessage({ message: { raw: hash } }) };
}
