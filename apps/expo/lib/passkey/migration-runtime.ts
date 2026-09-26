/**
 * Real-world wiring for `runPasskeyMigration`: the passkey library, SecureStore, and a Gnosis
 * public client. The thirdweb pieces (admin EOA signer, persisted MACI keypair) come from the
 * screen, which owns the React context.
 */
import { createPublicClient, http, type Address, type Hex, type TypedDataDefinition } from 'viem';
import * as SecureStore from '@/lib/storage/secureStorage';
import { loadStoredIdentity } from '@/lib/nostr/identity';
import { legacyAccountReadAbi } from './legacy-handover';
import type { MigrationDeps } from './migration';
import { needsLegacyDeploy } from './migration-v3';
import { wrapSecret } from './prf-vault';
import { DEFAULT_GNOSIS_RPC_URL, isSafeDeployed, sendPasskeyUserOp } from './userop';
import { createPasskey, getPrfSecret } from './webauthn';

const gnosisClient = createPublicClient({ transport: http(DEFAULT_GNOSIS_RPC_URL, { timeout: 15_000, retryCount: 1 }) });

export const secureKeyValueStorage: MigrationDeps['storage'] = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
};

/** `legacy.isAdmin(safe)`; an undeployed legacy account has no admins to add to — surfaced as an error. */
export async function readLegacyIsAdmin(legacy: Address, safe: Address): Promise<boolean> {
  const code = await gnosisClient.getCode({ address: legacy });
  if (!code || code === '0x') throw new Error('legacy account is not deployed on Gnosis');
  return gnosisClient.readContract({ address: legacy, abi: legacyAccountReadAbi, functionName: 'isAdmin', args: [safe] });
}

export function createMigrationDeps(p: {
  /** EIP-712 signer of the thirdweb ADMIN EOA (`wallet.getAdminAccount()`), never the smart account. */
  signTypedData: (typed: TypedDataDefinition<any, any>) => Promise<Hex>;
  /** The persisted MACI keypair as stored by MaciContext (JSON string), or null. */
  maciKeypairJson: string | null;
  /** The thirdweb admin EOA address; needed only when the legacy account is counterfactual on Gnosis. */
  adminAddress?: Address;
}): MigrationDeps {
  return {
    storage: secureKeyValueStorage,
    createPasskey,
    getPrfSecret,
    wrapSecret,
    readMaciSecret: async () => (p.maciKeypairJson ? new TextEncoder().encode(p.maciKeypairJson) : null),
    readNostrSecret: async () => (await loadStoredIdentity())?.secretKey ?? null,
    readIsAdmin: readLegacyIsAdmin,
    signTypedData: p.signTypedData,
    isSafeDeployed: (safe) => isSafeDeployed(safe),
    sendPasskeyUserOp: (args) => sendPasskeyUserOp(args),
    needsLegacyDeploy: (legacy) => needsLegacyDeploy(legacy, gnosisClient),
    ...(p.adminAddress ? { adminAddress: async () => p.adminAddress as Address } : {}),
  };
}
