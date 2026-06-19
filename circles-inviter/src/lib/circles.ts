// Circles wiring for the Röbel inviter mini-app.
//
// "Use the SDK" (per Gnosis DevRel): the invitation-manager UI only exposes
// InviteFarm.generateReferrals() (claimable links → NEW accounts). To invite our
// citizens' EXISTING wallets we call InviteFarm.generateInvites(inviter, invitees[]),
// which draws from the inviter's InvitationFarm quota and is purely on-chain (returns
// { invitees, transactions } — no key storage / referrals server needed).
//
// Config values mirror the official aboutcircles/circles-invitation-links-manager.
import { InviteFarm } from "@aboutcircles/sdk-invitations";
import { createPublicClient, http, encodeFunctionData, getAddress, type Address } from "viem";
import { gnosis } from "viem/chains";

export const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8" as const;
export const INVITATION_FARM = "0xd28b7C4f148B1F1E190840A1f7A796C5525D8902" as const;
// Röbel Münzen Circles v2 BaseGroup (the town's group token).
export const ROEBEL_GROUP = "0xAc2CeCdBead594F97358a0d3132454f24F3E470c" as const;
// The group's collateral vault (BaseTreasury). IMMUTABLE on the group contract — only a
// full group redeploy could change it (in which case bump ROEBEL_GROUP too). Holds members'
// personal CRC 1:1 behind the supply. Verified: group.BASE_TREASURY() === this address.
export const ROEBEL_VAULT = "0x0476fd3bD5EbCE0Af18C70dE221eC47F508e8763" as const;
export const GNOSIS_RPC = "https://rpc.gnosischain.com";

// CirclesConfig (sdk-types). Cast keeps us decoupled from the exact exported type.
export const inviteFarm = new InviteFarm({
  circlesRpcUrl: GNOSIS_RPC,
  pathfinderUrl: "https://pathfinder.aboutcircles.com",
  profileServiceUrl: "https://profile.aboutcircles.com",
  // Unused by generateInvites (on-chain only); only referrals hit this service.
  referralsServiceUrl: "https://invites.aboutcircles.com",
  v1HubAddress: "0x29b9a7fBb8995b2423a71cC17cf9810798F6C543",
  v2HubAddress: HUB,
  nameRegistryAddress: "0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474",
  baseGroupMintPolicy: "0x79Cbc9C7077dF161b92a745345A6Ade3fC626A60",
  standardTreasury: "0x08F90aB73A515308f03A718257ff9887ED330C6e",
  coreMembersGroupDeployer: "0xD0B5Bd9962197BEaC4cbA24244ec3587f19Bd06d",
  baseGroupFactoryAddress: "0xD0B5Bd9962197BEaC4cbA24244ec3587f19Bd06d",
  liftERC20Address: "0x5F99a795dD2743C36D63511f0D4bc667e6d3cDB5",
  invitationFarmAddress: INVITATION_FARM,
  referralsModuleAddress: "0x12105a9b291af2abb0591001155a75949b062ce5",
  invitationModuleAddress: "0x00738aca013B7B2e6cfE1690F0021C3182Fa40B5",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

const publicClient = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC) });

const hubAbi = [
  { type: "function", name: "isHuman", stateMutability: "view", inputs: [{ name: "h", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

/** Remaining InvitationFarm quota for an inviter (number of invites it may create). */
export async function getQuota(inviter: Address): Promise<bigint> {
  try {
    return await inviteFarm.getQuota(inviter);
  } catch {
    return 0n;
  }
}

/** True once `addr` is a registered Circles human (skip — don't waste quota on it). */
export async function isHuman(addr: Address): Promise<boolean> {
  return publicClient.readContract({ address: HUB, abi: hubAbi, functionName: "isHuman", args: [addr] });
}

/** Shape the SDK's TransactionRequest[] for the miniapp host's sendTransactions(). */
export function toHostTxs(transactions: { to: string; data: string; value?: bigint | string }[]) {
  return transactions.map((tx) => ({
    to: tx.to,
    data: tx.data,
    value: tx.value ? String(tx.value) : "0",
  }));
}

// ── Self-fund path (no quota) ────────────────────────────────────────────────
// Inviting an existing address burns 96 personal CRC (raw ERC-1155) from the inviter
// when the invitee registers. The inviter's CRC may be WRAPPED to ERC-20 — so we unwrap
// the shortfall (DemurrageCircles.unwrap) and then trust(invitee). The 96-burn lands later
// on the invitee's registerHuman (done in the Röbel app). trust() itself costs no CRC.
export const INVITATION_FEE = 96n * 10n ** 18n;
const FAR_EXPIRY = 4102444800n; // ~year 2100 (uint96)
const CIRCLES_RPC = "https://rpc.aboutcircles.com/";

const trustUnwrapAbi = [
  { type: "function", name: "trust", stateMutability: "nonpayable", inputs: [{ name: "_trustReceiver", type: "address" }, { name: "_expiry", type: "uint96" }], outputs: [] },
  { type: "function", name: "unwrap", stateMutability: "nonpayable", inputs: [{ name: "_amount", type: "uint256" }], outputs: [] },
] as const;
const balAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

export interface SelfFundInfo {
  rawAtto: bigint;
  wrappedAtto: bigint;
  wrapperAddress: string | null;
  affordable: number; // how many 96-CRC invites the inviter can self-fund
}

/** Inviter's own personal CRC: raw (ERC-1155 in the Hub) + wrapped (ERC-20), via Circles RPC. */
export async function getSelfFundInfo(inviter: Address): Promise<SelfFundInfo> {
  const rawAtto = (await publicClient
    .readContract({ address: HUB, abi: balAbi, functionName: "balanceOf", args: [inviter, BigInt(inviter)] })
    .catch(() => 0n)) as bigint;
  let wrappedAtto = 0n;
  let wrapperAddress: string | null = null;
  try {
    const res = await fetch(CIRCLES_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "circles_getTokenBalances", params: [inviter] }),
    });
    const list: Record<string, unknown>[] = (await res.json())?.result ?? [];
    for (const t of list) {
      if (String(t.tokenOwner).toLowerCase() === inviter.toLowerCase() && t.isWrapped && !t.isGroup && !t.isInflationary) {
        wrappedAtto += BigInt((t.attoCircles as string) ?? "0");
        wrapperAddress = getAddress(t.tokenAddress as string);
      }
    }
  } catch {
    /* ignore */
  }
  const affordable = Number((rawAtto + wrappedAtto) / INVITATION_FEE);
  return { rawAtto, wrappedAtto, wrapperAddress, affordable };
}

// ── Collateral locked ────────────────────────────────────────────────────────
// Röbel Münzen are a BaseGroup token: every coin is backed 1:1 by a member's personal
// CRC locked in the group's vault (BaseTreasury, = ROEBEL_VAULT). The Circles RPC view
// `GroupCollateralByToken` only indexes the LEGACY StandardTreasury flow, so for a
// BaseGroup it returns nothing (→ a false "0"). We instead sum the personal CRC the vault
// actually holds via circles_getTokenBalances — one reliable RPC call, no contract read.
export async function getCollateralLocked(): Promise<number> {
  try {
    const res = await fetch(CIRCLES_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "circles_getTokenBalances", params: [ROEBEL_VAULT] }),
    });
    const list: Record<string, unknown>[] = (await res.json())?.result ?? [];
    let atto = 0n;
    for (const t of list) {
      if (t.isGroup) continue; // collateral is members' PERSONAL CRC, never the group token
      atto += BigInt((t.attoCircles as string) ?? "0");
    }
    return Number(atto / 10n ** 16n) / 100; // CRC, 2 dp
  } catch {
    return 0;
  }
}

/** Self-fund tx batch: unwrap any shortfall, then trust each invitee. Signed by the host. */
export function buildSelfFundTxs(info: SelfFundInfo, invitees: Address[]): { to: string; data: string; value: string }[] {
  const need = BigInt(invitees.length) * INVITATION_FEE;
  const txs: { to: string; data: string; value: string }[] = [];
  if (need > info.rawAtto && info.wrapperAddress) {
    let shortfall = need - info.rawAtto;
    shortfall += shortfall / 50n; // ~2% demurrage buffer
    if (shortfall > info.wrappedAtto) shortfall = info.wrappedAtto;
    if (shortfall > 0n) {
      txs.push({ to: info.wrapperAddress, data: encodeFunctionData({ abi: trustUnwrapAbi, functionName: "unwrap", args: [shortfall] }), value: "0" });
    }
  }
  for (const c of invitees) {
    txs.push({ to: HUB, data: encodeFunctionData({ abi: trustUnwrapAbi, functionName: "trust", args: [c, FAR_EXPIRY] }), value: "0" });
  }
  return txs;
}
