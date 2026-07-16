// Read-only Gemeinschaftskasse (town treasury) balances for the Governance tab.
//
// The treasury is the Attester Safe multisig on Gnosis. Signing / payouts live in the
// auth-gated apps/web admin dashboard; here we only READ the public on-chain balances
// (same model as the Expo treasury screen). Every read is best-effort → zeros on failure
// so the UI never throws.
import { createPublicClient, http, type Address } from "viem";
import { gnosis } from "viem/chains";
import { HUB, ROEBEL_GROUP, GNOSIS_RPC } from "./circles";

// Stadtkasse / Gemeinschaftskasse multisig (group owner, funds the Funder).
export const TREASURY_SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa" as const;
// Regulated euro stablecoin (Monerium EURe V2) on Gnosis — 18 decimals. V1 0xcB444e90… is deprecated.
export const EURE = "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430" as const;
// xDAI is ~USD-pegged; indicative € conversion (matches apps/web + apps/expo XDAI_EUR).
const XDAI_EUR = 0.92;
// The group's ERC-1155 token id on the Hub is uint256(group address).
const GROUP_TOKEN_ID = BigInt(ROEBEL_GROUP);

const client = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC) });

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const erc1155Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

const toUnits = (raw: bigint): number => Number(raw / 10n ** 14n) / 1e4; // 18-dec → number, 4 dp

export interface Treasury {
  /** Indicative euro total (xDAI·0.92 + EURe). */
  euro: number;
  xdai: number;
  eure: number;
  /** Röbel-Münzen (Circles group token) held by the treasury. */
  muenzen: number;
}

export async function getTreasury(): Promise<Treasury> {
  const safe = TREASURY_SAFE as Address;
  const [xdaiRaw, eureRaw, muenzenRaw] = await Promise.all([
    client.getBalance({ address: safe }).catch(() => 0n),
    client
      .readContract({ address: EURE, abi: erc20Abi, functionName: "balanceOf", args: [safe] })
      .catch(() => 0n) as Promise<bigint>,
    client
      .readContract({ address: HUB, abi: erc1155Abi, functionName: "balanceOf", args: [safe, GROUP_TOKEN_ID] })
      .catch(() => 0n) as Promise<bigint>,
  ]);
  const xdai = toUnits(xdaiRaw);
  const eure = toUnits(eureRaw);
  const muenzen = toUnits(muenzenRaw);
  return { euro: xdai * XDAI_EUR + eure, xdai, eure, muenzen };
}
