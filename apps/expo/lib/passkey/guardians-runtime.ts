/**
 * Real-world wiring for the guardian + recovery screens: Gnosis clients, Supabase profile lookups
 * (with an AbortController deadline: RN fetch never times out on its own), the local label store
 * and the sponsored ops. The logic lives in the tested pure modules; this file only connects them.
 */
import { createPublicClient, getAddress, http, isAddressEqual, type Address, type Hex } from 'viem';
import * as SecureStore from '@/lib/storage/secureStorage';
import { supabase } from '@/lib/supabase';
import { identityModeFor, type GuardianConfirmPlan, type IdentityMode } from './guardian-plan';
import {
  readGuardians,
  readRecoveryApprovals,
  readRecoveryRequest,
  readThreshold,
  readWebAuthnSigner,
  type RecoveryRequest,
} from './guardians';
import { parseV3Config, readIdentityTokens } from './migration-v3';
import type { MigrationRecord } from './migration';
import { secureKeyValueStorage } from './migration-runtime';
import { resolvePeople, withLabel, type Person, type ProfileRow } from './people';
import type { RecoveryDeps, RecoveryStorage } from './recovery-flow';
import { createLookupChain, findLinkedLegacies } from './recovery-lookup';
import { DEFAULT_GNOSIS_RPC_URL, isSafeDeployed, sendPasskeyUserOp, type SponsoredCall } from './userop';
import { createPasskey } from './webauthn';

/** Gnosis' own RPC accepts address-less topic filters on eth_getLogs (publicnode refuses them). */
export const GNOSIS_LOGS_RPC_URL = process.env.EXPO_PUBLIC_GNOSIS_LOGS_RPC_URL || 'https://rpc.gnosischain.com';

const REQUEST_TIMEOUT_MS = 12_000;

const readClient = createPublicClient({ transport: http(DEFAULT_GNOSIS_RPC_URL, { timeout: 15_000, retryCount: 1 }) });
const logsClient = createPublicClient({ transport: http(GNOSIS_LOGS_RPC_URL, { timeout: 20_000, retryCount: 1 }) });

export const lookupChain = createLookupChain(logsClient as any, { readGuardians: (safe) => readGuardians(safe) });

/** A signal that aborts after `ms` (RN fetch has no timeout of its own). */
export function deadline(ms = REQUEST_TIMEOUT_MS): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

// ---------------------------------------------------------------------------
// Profiles (only name fields: never pull email / phone for this)
// ---------------------------------------------------------------------------

const PROFILE_FIELDS = 'wallet_address, username, display_name, profile_picture_url';

export async function fetchProfilesByWallet(wallets: string[]): Promise<ProfileRow[]> {
  const list = Array.from(new Set(wallets.map((w) => w.toLowerCase()))).filter(Boolean);
  if (list.length === 0) return [];
  const d = deadline();
  try {
    const { data, error } = await supabase.from('users').select(PROFILE_FIELDS).in('wallet_address', list).abortSignal(d.signal);
    if (error) throw error;
    return (data as ProfileRow[] | null) ?? [];
  } finally {
    d.done();
  }
}

export type PersonSearchHit = ProfileRow & { tier: string | null };

/** "Name suchen": people by username / display name (min. 2 characters). */
export async function searchPeopleByName(query: string): Promise<PersonSearchHit[]> {
  const q = query.trim().replace(/[%_,()]/g, ' ').trim();
  if (q.length < 2) return [];
  const d = deadline();
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`${PROFILE_FIELDS}, tier`)
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .not('wallet_address', 'is', null)
      .limit(20)
      .abortSignal(d.signal);
    if (error) throw error;
    return ((data as PersonSearchHit[] | null) ?? []).filter((r) => !!(r.display_name || r.username));
  } finally {
    d.done();
  }
}

// ---------------------------------------------------------------------------
// Local labels (a family member's fresh passkey Safe has no profile)
// ---------------------------------------------------------------------------

export const LABELS_STORE_KEY = 'passkey_guardian_labels_v1';
/** The display name this device's own passkey Safe goes by (shown in "Mein Konto-Code"). */
export const OWN_NAME_STORE_KEY = 'passkey_own_name_v1';

export async function loadLabels(): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(LABELS_STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveLabel(address: Address, name: string | null): Promise<void> {
  const next = withLabel(await loadLabels(), address, name);
  await SecureStore.setItemAsync(LABELS_STORE_KEY, JSON.stringify(next));
}

export async function loadOwnName(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(OWN_NAME_STORE_KEY))?.trim() || null;
  } catch {
    return null;
  }
}

export async function saveOwnName(name: string): Promise<void> {
  await SecureStore.setItemAsync(OWN_NAME_STORE_KEY, name.trim());
}

export async function resolvePeopleNow(addresses: readonly Address[]): Promise<Map<string, Person>> {
  return resolvePeople(addresses, {
    fetchProfiles: fetchProfilesByWallet,
    labels: await loadLabels(),
    findLinkedLegacies: (safe) => findLinkedLegacies(safe, lookupChain),
  });
}

// ---------------------------------------------------------------------------
// Identity + attester checks
// ---------------------------------------------------------------------------

const hasAttesterAbi = [
  {
    type: 'function',
    name: 'hasAttesterNFT',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
/** AttesterNFTv2 on Gnosis (packages/blockchain attesterNFT). */
export const ATTESTER_NFT_V2: Address = '0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82';

const safeOwnersAbi = [
  { type: 'function', name: 'getOwners', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address[]' }] },
] as const;

export async function readSafeOwners(safe: Address): Promise<Address[]> {
  return [...((await readClient.readContract({ address: safe, abi: safeOwnersAbi, functionName: 'getOwners' })) as readonly Address[])];
}

export async function isAttester(address: Address): Promise<boolean> {
  const v3 = parseV3Config().attesterNft;
  const reads = [ATTESTER_NFT_V2, ...(v3 ? [v3] : [])].map((nft) =>
    readClient
      .readContract({ address: nft, abi: hasAttesterAbi, functionName: 'hasAttesterNFT', args: [address] })
      .then(Boolean)
      .catch(() => false),
  );
  return (await Promise.all(reads)).some(Boolean);
}

/** The sponsor mode for ops sent by this device's Safe (guardian changes, cancelRecovery). */
export async function readIdentityMode(record: MigrationRecord): Promise<IdentityMode | null> {
  const [safeTokens, legacyTokens] = await Promise.all([
    readIdentityTokens(record.safe, undefined, readClient as any),
    record.legacy ? readIdentityTokens(record.legacy, undefined, readClient as any) : Promise.resolve(null),
  ]);
  return identityModeFor({
    record,
    safeIsCitizen: safeTokens.citizenV2 || safeTokens.citizenV3,
    legacyIsCitizen: !!legacyTokens && (legacyTokens.citizenV2 || legacyTokens.citizenV3),
  });
}

// ---------------------------------------------------------------------------
// Sponsored ops
// ---------------------------------------------------------------------------

/** One fingerprint-signed op from this device's own Safe (guardian management / cancel). */
export async function sendOwnSafeOp(record: MigrationRecord, mode: IdentityMode, calls: SponsoredCall[]): Promise<Hex> {
  const deployed = await isSafeDeployed(record.safe);
  const { txHash } = await sendPasskeyUserOp({
    credentialId: record.credentialId,
    x: record.x,
    y: record.y,
    calls,
    deployed,
    sender: record.safe,
    owner: record.owner,
    ...(mode.mode === 'legacy' ? { legacy: mode.legacy } : {}),
  });
  return txHash;
}

export async function readRecoveryRequestSafe(safe: Address): Promise<RecoveryRequest | null> {
  try {
    return await readRecoveryRequest(safe);
  } catch {
    return null;
  }
}

export async function readGuardianState(safe: Address): Promise<{ guardians: Address[]; threshold: number }> {
  const [guardians, threshold] = await Promise.all([readGuardians(safe), readThreshold(safe)]);
  return { guardians: guardians.map((g) => getAddress(g)), threshold: Number(threshold) };
}

export const recoveryStorage: RecoveryStorage = {
  ...secureKeyValueStorage,
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export function createRecoveryDeps(): RecoveryDeps {
  return {
    storage: recoveryStorage,
    createPasskey,
    getSigner: (x, y) => readWebAuthnSigner(x, y),
    readThreshold: (w) => readThreshold(w),
    readApprovals: (w, owners, t) => readRecoveryApprovals(w, owners, t),
    readRequest: (w) => readRecoveryRequest(w),
    readOwners: readSafeOwners,
    isSafeDeployed: (s) => isSafeDeployed(s),
    sendPasskeyUserOp: (a) => sendPasskeyUserOp(a),
  };
}

export const sameAddress = (a: Address | null | undefined, b: Address | null | undefined) =>
  !!a && !!b && isAddressEqual(a, b);

/**
 * The guardian's on-chain confirmation (one fingerprint). My Safe may be counterfactual: the op
 * deploys it. A legacy-account guardian confirms through `legacy.execute` (sponsor mode "legacy").
 */
export async function sendGuardianConfirm(
  record: MigrationRecord,
  plan: Extract<GuardianConfirmPlan, { kind: 'safe' | 'legacy' }>,
): Promise<Hex> {
  const deployed = await isSafeDeployed(record.safe);
  const { txHash } = await sendPasskeyUserOp({
    credentialId: record.credentialId,
    x: record.x,
    y: record.y,
    calls: plan.calls,
    deployed,
    sender: record.safe,
    owner: record.owner,
    ...(plan.kind === 'legacy' ? { legacy: plan.legacy } : plan.recoveryLegacy ? { recoveryLegacy: plan.recoveryLegacy } : {}),
  });
  return txHash;
}
