/**
 * v3 identity move: CitizenNFTv3 / AttesterNFTv3 `moveTo(newAccount)` burns the token on the
 * legacy thirdweb account and re-mints it (same id) on the passkey Safe. The contract checks
 * `legacy.isAdmin(newAccount)`, so the handover (legacy-handover.ts) must come first, in an
 * earlier op or earlier in the same batch.
 *
 * 10 of 53 citizens' legacy accounts are COUNTERFACTUAL on Gnosis (never deployed; v2
 * `hasCitizenNFT` is a mapping, so they are citizens anyway). Their batch must START with the
 * permissionless AccountFactory.createAccount(adminEoa, 0x); the sponsor allows it only as call
 * #0 and only when factory.getAddress(adminEoa, 0x) == legacy.
 *
 * One sponsored op from the passkey Safe (sponsor mode "legacy", body names `legacy`):
 *   buildMigrationV3Calls({ legacy, safe, adminEoa, needsDeploy, handover, moveCitizen, moveAttester })
 *   = [createAccount?] ++ [handover?] ++ [legacy.execute(v3Citizen, 0, moveTo(safe))]
 *     ++ [legacy.execute(v3Attester, 0, moveTo(safe))?]
 * After it, the Safe itself holds citizenship: later ops (e.g. guardian management) can omit
 * `legacy` (sponsor mode "safe").
 *
 * v3 is off unless EXPO_PUBLIC_PASSKEY_CITIZEN_NFT_V3 is set (the UI hides the flow).
 */
import { createPublicClient, encodeFunctionData, getAddress, http, isAddress, type Address, type Hex } from 'viem';
import {
  CITIZEN_NFT_V2,
  PASSKEY_ATTESTER_NFT_V3,
  PASSKEY_CITIZEN_NFT_V3,
  THIRDWEB_ACCOUNT_FACTORY,
} from './constants';
import { DEFAULT_GNOSIS_RPC_URL, type SponsoredCall } from './userop';

export type V3Config = { citizenNft?: Address; attesterNft?: Address };

/** Parses the EXPO_PUBLIC_PASSKEY_*_NFT_V3 values; empty / malformed = unset. */
export function parseV3Config(citizen: string = PASSKEY_CITIZEN_NFT_V3, attester: string = PASSKEY_ATTESTER_NFT_V3): V3Config {
  const pick = (v: string) => (v && isAddress(v, { strict: false }) ? getAddress(v.toLowerCase()) : undefined);
  return { citizenNft: pick(citizen), attesterNft: pick(attester) };
}

/** The v3 flows are visible only with a configured CitizenNFTv3. */
export function isV3Enabled(cfg: V3Config = parseV3Config()): boolean {
  return !!cfg.citizenNft;
}

const accountExecuteAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_target', type: 'address' },
      { name: '_value', type: 'uint256' },
      { name: '_calldata', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const moveToAbi = [
  {
    type: 'function',
    name: 'moveTo',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newAccount', type: 'address' }],
    outputs: [],
  },
] as const;

const accountFactoryAbi = [
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_admin', type: 'address' },
      { name: '_data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getAddress',
    stateMutability: 'view',
    inputs: [
      { name: '_adminSigner', type: 'address' },
      { name: '_data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const hasCitizenAbi = [
  {
    type: 'function',
    name: 'hasCitizenNFT',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
const hasAttesterAbi = [
  {
    type: 'function',
    name: 'hasAttesterNFT',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/** `legacy.execute(v3Address, 0, moveTo(safe))` — the only moveTo shape the sponsor accepts. */
export function buildMoveToCalls(legacy: Address, v3Address: Address, safe: Address): SponsoredCall[] {
  const move = encodeFunctionData({ abi: moveToAbi, functionName: 'moveTo', args: [safe] });
  return [{ to: legacy, data: encodeFunctionData({ abi: accountExecuteAbi, functionName: 'execute', args: [v3Address, 0n, move] }) }];
}

/** AccountFactory.createAccount(adminEoa, 0x): MUST be the first call of the batch. */
export function buildCreateLegacyAccountCall(adminEoa: Address): SponsoredCall {
  return {
    to: THIRDWEB_ACCOUNT_FACTORY,
    data: encodeFunctionData({ abi: accountFactoryAbi, functionName: 'createAccount', args: [adminEoa, '0x'] }),
  };
}

/**
 * The whole one-op migration batch, in the order the sponsor requires:
 * createAccount (only if `needsDeploy`) → handover (if not yet admin) → moveTo(s).
 */
export function buildMigrationV3Calls(args: {
  legacy: Address;
  safe: Address;
  /** The thirdweb admin EOA; required when `needsDeploy`. */
  adminEoa?: Address;
  needsDeploy: boolean;
  /** legacy.setPermissionsForSigner(add safe) — omit when the Safe is already admin. */
  handover?: SponsoredCall;
  moveCitizen: boolean;
  moveAttester: boolean;
  v3?: V3Config;
}): SponsoredCall[] {
  const v3 = args.v3 ?? parseV3Config();
  const calls: SponsoredCall[] = [];
  if (args.needsDeploy) {
    if (!args.adminEoa) throw new Error('adminEoa is required to deploy the legacy account');
    if (!args.handover) throw new Error('a freshly deployed legacy account needs the handover in the same op');
    calls.push(buildCreateLegacyAccountCall(args.adminEoa));
  }
  if (args.handover) calls.push(args.handover);
  if (args.moveCitizen) {
    if (!v3.citizenNft) throw new Error('CitizenNFTv3 is not configured');
    calls.push(...buildMoveToCalls(args.legacy, v3.citizenNft, args.safe));
  }
  if (args.moveAttester) {
    if (!v3.attesterNft) throw new Error('AttesterNFTv3 is not configured');
    calls.push(...buildMoveToCalls(args.legacy, v3.attesterNft, args.safe));
  }
  if (calls.length === 0) throw new Error('nothing to migrate');
  return calls;
}

// ---------------------------------------------------------------------------
// Chain reads (Gnosis)
// ---------------------------------------------------------------------------

export type GnosisCodeClient = {
  getCode: (args: { address: Address }) => Promise<Hex | undefined>;
  readContract: (args: any) => Promise<any>;
};

let defaultClient: GnosisCodeClient | null = null;
function gnosis(client?: GnosisCodeClient): GnosisCodeClient {
  if (client) return client;
  defaultClient ??= createPublicClient({ transport: http(DEFAULT_GNOSIS_RPC_URL, { timeout: 15_000, retryCount: 1 }) });
  return defaultClient;
}

/** true when the legacy account has no code on Gnosis yet (counterfactual). */
export async function needsLegacyDeploy(legacy: Address, client?: GnosisCodeClient): Promise<boolean> {
  const code = await gnosis(client).getCode({ address: legacy });
  return !code || code === '0x';
}

/** AccountFactory.getAddress(adminEoa, 0x): must equal `legacy` before `buildCreateLegacyAccountCall`. */
export async function predictLegacyAccount(adminEoa: Address, client?: GnosisCodeClient): Promise<Address> {
  return gnosis(client).readContract({
    address: THIRDWEB_ACCOUNT_FACTORY,
    abi: accountFactoryAbi,
    functionName: 'getAddress',
    args: [adminEoa, '0x'],
  });
}

/** Which identity tokens `account` holds (v2 citizen, and the configured v3 citizen / attester). */
export async function readIdentityTokens(
  account: Address,
  cfg: V3Config = parseV3Config(),
  client?: GnosisCodeClient,
): Promise<{ citizenV2: boolean; citizenV3: boolean; attesterV3: boolean }> {
  const c = gnosis(client);
  const read = (address: Address, abi: typeof hasCitizenAbi | typeof hasAttesterAbi, functionName: string) =>
    c.readContract({ address, abi, functionName, args: [account] }) as Promise<boolean>;
  const [citizenV2, citizenV3, attesterV3] = await Promise.all([
    read(CITIZEN_NFT_V2, hasCitizenAbi, 'hasCitizenNFT'),
    cfg.citizenNft ? read(cfg.citizenNft, hasCitizenAbi, 'hasCitizenNFT') : Promise.resolve(false),
    cfg.attesterNft ? read(cfg.attesterNft, hasAttesterAbi, 'hasAttesterNFT') : Promise.resolve(false),
  ]);
  return { citizenV2, citizenV3, attesterV3 };
}
