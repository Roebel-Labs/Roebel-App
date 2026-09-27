/**
 * NSP-14 org Safes — chain reads (Gnosis). No database: an org's Safe is found
 * in the OrgRegistry once registered, and from its own RegistrationRequested
 * event while it waits for approval.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPublicClient, getAddress, http, parseAbiItem, type Address, type Hex } from 'viem';
import { gnosis } from 'viem/chains';
import { orgRegistryGnosisAddress, orgRegistryDeployBlock } from '@/constants/gnosis';
import type { OrgChainState, OrgRole } from './ops';

const RPC = process.env.EXPO_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com';
const client = createPublicClient({ chain: gnosis, transport: http(RPC) });

const registryAbi = [
  parseAbiItem('function isRegistered(bytes32 orgId) view returns (bool)'),
  parseAbiItem('function getOrg(bytes32 orgId) view returns ((address safe, uint64 generation, uint64 registeredAt, string metadataURI))'),
  parseAbiItem('function roleOf(bytes32 orgId, address account) view returns (uint8)'),
  parseAbiItem('function openRegistrationOf(address safe) view returns (bool open, uint256 requestId)'),
  parseAbiItem(
    'function getRequest(uint256 requestId) view returns ((uint8 requestType, uint8 status, bytes32 orgId, address safe, address requester, string uri, uint32 approvals, uint32 rejections, uint32 requiredApprovals, uint32 requiredRejections, uint64 createdAt, uint64 expiresAt, uint64 claimGeneration))',
  ),
] as const;
const safeAbi = [
  parseAbiItem('function getOwners() view returns (address[])'),
  parseAbiItem('function getThreshold() view returns (uint256)'),
] as const;
const registrationRequested = parseAbiItem(
  'event RegistrationRequested(uint256 indexed requestId, bytes32 indexed orgId, address indexed safe, string metadataURI, uint32 requiredApprovals, uint32 requiredRejections, uint64 expiresAt)',
);

const ROLES: (OrgRole | 'none')[] = ['none', 'member', 'admin'];
const cacheKey = (orgId: Hex) => `org-safe:v1:${orgRegistryGnosisAddress.toLowerCase()}:${orgId}`;

export function orgSafesConfigured(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(orgRegistryGnosisAddress);
}

export async function rememberOrgSafe(orgId: Hex, safe: Address): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(orgId), safe);
  } catch {
    // cache only
  }
}

async function isContract(address: Address): Promise<boolean> {
  const code = await client.getCode({ address });
  return !!code && code !== '0x';
}

/** Newest RegistrationRequested for this org, scanning back at most the 30-day request TTL. */
async function findRequestedSafe(orgId: Hex): Promise<Address | null> {
  const head = await client.getBlockNumber();
  const floor = BigInt(orgRegistryDeployBlock);
  const ttlBlocks = 560_000n; // ~30 days at 5 s
  const stop = head > ttlBlocks && head - ttlBlocks > floor ? head - ttlBlocks : floor;
  const window = 10_000n; // public Gnosis RPCs cap log ranges
  for (let to = head; to >= stop; to -= window) {
    const from = to - window + 1n > stop ? to - window + 1n : stop;
    const logs = await client.getLogs({
      address: orgRegistryGnosisAddress as Address,
      event: registrationRequested,
      args: { orgId },
      fromBlock: from,
      toBlock: to,
    });
    if (logs.length) return getAddress(logs[logs.length - 1].args.safe as Address);
    if (from === stop) break;
  }
  return null;
}

export type OrgSafeStatus =
  | { kind: 'none' }
  | {
      kind: 'pending';
      safe: Address;
      approvals: number;
      required: number;
      expiresAt: number;
      open: boolean;
    }
  | { kind: 'registered'; safe: Address };

export async function readOrgSafeStatus(orgId: Hex): Promise<OrgSafeStatus> {
  const registry = orgRegistryGnosisAddress as Address;
  if (await client.readContract({ address: registry, abi: registryAbi, functionName: 'isRegistered', args: [orgId] })) {
    const org = await client.readContract({ address: registry, abi: registryAbi, functionName: 'getOrg', args: [orgId] });
    await rememberOrgSafe(orgId, org.safe);
    return { kind: 'registered', safe: getAddress(org.safe) };
  }

  let safe: Address | null = null;
  try {
    const cached = await AsyncStorage.getItem(cacheKey(orgId));
    if (cached && (await isContract(cached as Address))) safe = getAddress(cached);
  } catch {
    safe = null;
  }
  if (!safe) safe = await findRequestedSafe(orgId);
  if (!safe) return { kind: 'none' };

  const [open, requestId] = await client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: 'openRegistrationOf',
    args: [safe],
  });
  if (!open) return { kind: 'pending', safe, approvals: 0, required: 0, expiresAt: 0, open: false };
  const r = await client.readContract({ address: registry, abi: registryAbi, functionName: 'getRequest', args: [requestId] });
  return {
    kind: 'pending',
    safe,
    approvals: Number(r.approvals),
    required: Number(r.requiredApprovals),
    expiresAt: Number(r.expiresAt),
    open: r.orgId.toLowerCase() === orgId.toLowerCase(),
  };
}

/** Owners, threshold and the onchain role of every account we care about. */
export async function readOrgChainState(orgId: Hex, safe: Address, accounts: readonly string[]): Promise<OrgChainState> {
  const registry = orgRegistryGnosisAddress as Address;
  const [owners, threshold] = await Promise.all([
    client.readContract({ address: safe, abi: safeAbi, functionName: 'getOwners' }),
    client.readContract({ address: safe, abi: safeAbi, functionName: 'getThreshold' }),
  ]);
  const unique = [...new Set(accounts.map((a) => a.toLowerCase()))];
  const roleIdx = await Promise.all(
    unique.map((a) =>
      client.readContract({ address: registry, abi: registryAbi, functionName: 'roleOf', args: [orgId, a as Address] }),
    ),
  );
  const roles: OrgChainState['roles'] = {};
  unique.forEach((a, i) => {
    const r = ROLES[Number(roleIdx[i])] ?? 'none';
    if (r !== 'none') roles[a] = r;
  });
  return { safe, owners: owners.map((o) => getAddress(o)), threshold: Number(threshold), roles };
}

export async function isDeployed(address: Address): Promise<boolean> {
  return isContract(address);
}
