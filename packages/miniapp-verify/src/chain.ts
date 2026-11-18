import { ABIS } from "./abis";
import { clientFor, type ClientOpts } from "./client";
import { MiniAppVerifyError } from "./errors";

export const CHAIN_ID = 100;

/** Gnosis (chain 100), copied from packages/blockchain/src/index.ts. */
export const ADDRESSES = {
  citizenNft: "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5",
  attesterNft: "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82",
  orgRegistry: "0x320b4ea2f4E31b81245e684D08AF593DE05E9919",
} as const;

const ACCOUNT_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Reads on chain whether `account` holds a built-in credential. An RPC failure throws (it is
 * never answered as "not held").
 */
export async function holdsCredential(type: "citizen" | "attester", account: string, opts?: ClientOpts): Promise<boolean> {
  if (!ACCOUNT_RE.test(account)) throw new MiniAppVerifyError("malformed", "account must be an address");
  const client = clientFor(opts);
  if (type === "citizen" || type === "attester") {
    const n = await client.readContract({
      address: type === "citizen" ? ADDRESSES.citizenNft : ADDRESSES.attesterNft,
      abi: type === "citizen" ? ABIS.citizenNft : ABIS.attesterNft,
      functionName: "balanceOf",
      args: [account as `0x${string}`],
    });
    return (n as bigint) > 0n;
  }
  throw new MiniAppVerifyError("unsupported", `unknown credential type ${String(type)}`);
}
