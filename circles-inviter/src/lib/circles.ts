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
import { createPublicClient, http, type Address } from "viem";
import { gnosis } from "viem/chains";

export const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8" as const;
export const INVITATION_FARM = "0xd28b7C4f148B1F1E190840A1f7A796C5525D8902" as const;
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
