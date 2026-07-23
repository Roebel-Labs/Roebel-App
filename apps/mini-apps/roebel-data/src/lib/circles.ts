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
import { createPublicClient, http, encodeFunctionData, getAddress, BaseError, HttpRequestError, type Address } from "viem";
import { gnosis } from "viem/chains";

export const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8" as const;
export const INVITATION_FARM = "0xd28b7C4f148B1F1E190840A1f7A796C5525D8902" as const;
// Röbel Münzen Circles v2 BaseGroup (the town's group token).
export const ROEBEL_GROUP = "0xAc2CeCdBead594F97358a0d3132454f24F3E470c" as const;
// The group's collateral vault (BaseTreasury). IMMUTABLE on the group contract — only a
// full group redeploy could change it (in which case bump ROEBEL_GROUP too). Holds members'
// personal CRC 1:1 behind the supply. Verified: group.BASE_TREASURY() === this address.
export const ROEBEL_VAULT = "0x0476fd3bD5EbCE0Af18C70dE221eC47F508e8763" as const;
// The group's mint policy — Hub.mintPolicies(group). Governs who may mint the group
// token. Group-specific (NOT the shared BaseGroup policy). Verified on-chain.
export const MINT_POLICY = "0xCDFc5135AEC0aFbf102C108e7f5C8A88C6112842" as const;
// The group owner — 3-of-5 Attester Safe (group.owner()). Threshold/profile changes
// route through this Safe.
export const GROUP_OWNER = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa" as const;
// The group service wallet — group.service() — auto-invite (trusts new citizens in).
export const GROUP_SERVICE = "0xd5028284017A32C672CbD73Fe35aCD897bA874cf" as const;
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
} as ConstructorParameters<typeof InviteFarm>[0]);

const publicClient = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC) });

const hubAbi = [
  { type: "function", name: "isHuman", stateMutability: "view", inputs: [{ name: "h", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isTrusted", stateMutability: "view", inputs: [{ name: "_truster", type: "address" }, { name: "_trustee", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

/** Remaining InvitationFarm quota for an inviter (number of invites it may create). */
export async function getQuota(inviter: Address): Promise<bigint> {
  try {
    return await inviteFarm.getQuota(inviter);
  } catch {
    return 0n;
  }
}

// ── Quota funding check ──────────────────────────────────────────────────────
// `getQuota` returns a nominal allowance, but a quota invite ALSO needs the farm
// to actually dispense 96 CRC per invite. The current InvitationFarm pays invites
// from bot avatars — each bot transfers its own freshly-minted CRC, walking a
// ~5,000-bot ring via `_transferFromBots` — so there is NO shared pool or approved
// funder whose balance could be read. The only reliable readiness check (per the
// Circles team, 2026-07-18) is to eth_call-simulate the actual claim: if
// claimInvites(n) doesn't revert, n invites are fundable. `generateInvites`
// (existing wallets) draws from the same bot ring, so one check covers both paths.
const CLAIM_INVITES_SELECTOR = "0xe28208a1"; // claimInvites(uint256)

export interface QuotaFunding {
  quota: number;
  /** How many of the quota invites are actually fundable on-chain right now. */
  fundableInvites: number;
}

/** True iff a claimInvites(count) sent by `inviter` would succeed right now. */
async function simulateClaim(inviter: Address, count: number): Promise<boolean> {
  const data = (CLAIM_INVITES_SELECTOR + count.toString(16).padStart(64, "0")) as `0x${string}`;
  try {
    await publicClient.call({ account: inviter, to: INVITATION_FARM, data });
    return true;
  } catch (e) {
    // A transport/RPC failure is "unknown", not "unfunded" — rethrow so the
    // caller returns null and the UI attempts instead of blocking the button.
    if (e instanceof BaseError && e.walk((x) => x instanceof HttpRequestError)) throw e;
    return false;
  }
}

export async function getQuotaFunding(inviter: Address): Promise<QuotaFunding | null> {
  try {
    const quota = Number(await getQuota(inviter));
    if (quota <= 0) return { quota: 0, fundableInvites: 0 };
    if (await simulateClaim(inviter, quota)) return { quota, fundableInvites: quota };
    // Partially fundable — binary-search the largest claim that still simulates.
    let lo = 0;
    let hi = quota - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (await simulateClaim(inviter, mid)) lo = mid;
      else hi = mid - 1;
    }
    return { quota, fundableInvites: lo };
  } catch {
    return null; // unknown → UI falls back to attempting + graceful error handling
  }
}

// ── Invite pre-flight ────────────────────────────────────────────────────────
// The claim leg above only proves the QUOTA is fundable. The second SDK tx
// (forwarding the claimed CRC to the InvitationModule with the invitee list)
// can still revert: the deployed module registers each invitee in-line via
// Safe-module exec (`validateModuleEnabled(invitee)` + registerHuman from the
// invitee's Safe), which only works for Circles-native (Metri/Safe) wallets —
// thirdweb smart accounts revert bare → ERC1155InvalidReceiver (0x57f447ce).
// Chain-simulate the EXACT txs (eth_simulateV1) before opening the wallet
// sheet so the user gets a clear message instead of a hex revert.
export type InvitePreflight = { ok: true } | { ok: false; failedIndex: number; reason: string };

export async function preflightInviteTxs(
  inviter: Address,
  transactions: { to: string; data: string; value?: bigint | string }[],
): Promise<InvitePreflight> {
  try {
    const sim = await publicClient.simulateCalls({
      account: inviter,
      calls: transactions.map((t) => ({
        to: t.to as Address,
        data: t.data as `0x${string}`,
        value: t.value ? BigInt(t.value) : 0n,
      })),
    });
    const idx = sim.results.findIndex((r) => r.status !== "success");
    if (idx === -1) return { ok: true };
    const err = (sim.results[idx] as { error?: { shortMessage?: string } }).error;
    return { ok: false, failedIndex: idx, reason: String(err?.shortMessage ?? "reverted").slice(0, 200) };
  } catch {
    return { ok: true }; // preflight unavailable (RPC without eth_simulateV1) → let the wallet decide
  }
}

/** True once `addr` is a registered Circles human (skip — don't waste quota on it). */
export async function isHuman(addr: Address): Promise<boolean> {
  return publicClient.readContract({ address: HUB, abi: hubAbi, functionName: "isHuman", args: [addr] });
}

/**
 * True when `truster` already has a live trust edge to `trustee`. An invite IS a
 * trust, so a citizen we already trust is "invited — awaiting registration", not
 * "invitable". Re-trusting them is a no-op that wastes a self-fund slot (and can
 * look like "nothing happened" in the host wallet), so the UI must distinguish it.
 */
export async function isTrusted(truster: Address, trustee: Address): Promise<boolean> {
  return publicClient.readContract({ address: HUB, abi: hubAbi, functionName: "isTrusted", args: [truster, trustee] });
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
