import { ABIS } from "./abis";
import { clientFor, type ClientOpts } from "./client";
import { MiniAppVerifyError } from "./errors";

export const CHAIN_ID = 100;

/** Gnosis (chain 100), copied from packages/blockchain/src/index.ts. */
export const ADDRESSES = {
  citizenNft: "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5",
  attesterNft: "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82",
  orgRegistry: "0x320b4ea2f4E31b81245e684D08AF593DE05E9919",
  /** Empty while the register is not deployed on Gnosis (`type:` refs are then unsupported). */
  credentialRegistry: "" as string,
} as const;

export type CredentialRef = "citizen" | "attester" | `type:0x${string}`;

const ACCOUNT_RE = /^0x[0-9a-fA-F]{40}$/;
const TYPE_RE = /^type:(0x[0-9a-fA-F]{64})$/;

/**
 * Reads on chain whether `account` holds a credential: a built-in (`citizen`, `attester`) or a
 * register type (`type:0x…`). Only public holdings are on chain; a private holding answers
 * `false` here and can only be proven with the user token. `registry` overrides
 * `ADDRESSES.credentialRegistry`; with neither, a `type:` ref throws `unsupported`. An RPC
 * failure throws (it is never answered as "not held").
 */
export async function holdsCredential(
  ref: CredentialRef,
  account: string,
  opts?: ClientOpts & { registry?: string },
): Promise<boolean> {
  if (!ACCOUNT_RE.test(account)) throw new MiniAppVerifyError("malformed", "account must be an address");
  if (ref === "citizen" || ref === "attester") {
    const n = await clientFor(opts).readContract({
      address: ref === "citizen" ? ADDRESSES.citizenNft : ADDRESSES.attesterNft,
      abi: ref === "citizen" ? ABIS.citizenNft : ABIS.attesterNft,
      functionName: "balanceOf",
      args: [account as `0x${string}`],
    });
    return (n as bigint) > 0n;
  }
  const t = typeof ref === "string" && ref.startsWith("type:") ? TYPE_RE.exec(ref) : null;
  if (typeof ref === "string" && ref.startsWith("type:") && !t) throw new MiniAppVerifyError("malformed", "type ref must be type:0x<64 hex>");
  if (!t) throw new MiniAppVerifyError("unsupported", `unknown credential ${String(ref)}`);
  const registry = opts?.registry ?? ADDRESSES.credentialRegistry;
  if (!ACCOUNT_RE.test(registry)) throw new MiniAppVerifyError("unsupported", "the credential register is not deployed yet");
  const held = await clientFor(opts).readContract({
    address: registry as `0x${string}`,
    abi: ABIS.credentialRegistry,
    functionName: "holds",
    args: [t[1].toLowerCase() as `0x${string}`, account as `0x${string}`],
  });
  return held === true;
}
