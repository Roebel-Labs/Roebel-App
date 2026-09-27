/**
 * Real-world wiring for passkey sign-in: native passkey calls, SecureStore, Gnosis reads, and the
 * thirdweb adapter wallet. The pure logic lives in signin.ts / thirdweb-adapter.ts / boot.ts.
 */
import { createPublicClient, http, type Address } from 'viem';
import { createWalletAdapter } from 'thirdweb/wallets';
import type { Account, Wallet } from 'thirdweb/wallets';
import { client, chain } from '@/constants/thirdweb';
import { supabase } from '@/lib/supabase';
import * as SecureStore from '@/lib/storage/secureStorage';
import { CITIZEN_NFT_V2 } from './constants';
import { lookupChain } from './guardians-runtime';
import { secureKeyValueStorage } from './migration-runtime';
import { isV3Enabled, parseV3Config } from './migration-v3';
import { randomBytes } from './random';
import { findLinkedLegacies } from './recovery-lookup';
import { passkeyApiSession } from './api-session-runtime';
import { clearPasskeySession, loadPasskeySession, type PasskeySession, type SessionStorage } from './session';
import { randomChallengeFrom, type IdentityChain, type KeyChain, type SignInDeps } from './signin';
import { passkeyWalletOptions, type AdapterDeps } from './thirdweb-adapter';
import { DEFAULT_GNOSIS_RPC_URL, isSafeDeployed, sendPasskeyUserOp } from './userop';
import { createPasskey, getDiscoverableAssertion, signWithPasskey } from './webauthn';

const gnosisClient = createPublicClient({ transport: http(DEFAULT_GNOSIS_RPC_URL, { timeout: 15_000, retryCount: 1 }) });

export const secureSessionStorage: SessionStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

const hasCitizenAbi = [
  {
    type: 'function',
    name: 'hasCitizenNFT',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const readHasCitizen = (nft: Address, account: Address) =>
  gnosisClient.readContract({ address: nft, abi: hasCitizenAbi, functionName: 'hasCitizenNFT', args: [account] }) as Promise<boolean>;

export const identityChain: IdentityChain = {
  findLinkedLegacies: (safe) => findLinkedLegacies(safe, lookupChain),
  holdsCitizenV2: (a) => readHasCitizen(CITIZEN_NFT_V2, a),
  holdsCitizenV3: async (a) => {
    const cfg = parseV3Config();
    return isV3Enabled(cfg) && cfg.citizenNft ? readHasCitizen(cfg.citizenNft, a) : false;
  },
};

/** A users row with this wallet exists (anon read of one column, 10 s deadline). */
async function isKnownAccount(a: Address): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const { data } = await supabase
      .from('users')
      .select('wallet_address')
      .eq('wallet_address', a.toLowerCase())
      .abortSignal(controller.signal)
      .maybeSingle();
    return !!data;
  } finally {
    clearTimeout(timer);
  }
}

const keyChain: KeyChain = {
  hasCode: async (a) => {
    const code = await gnosisClient.getCode({ address: a });
    return !!code && code !== '0x';
  },
  findLinkedLegacies: (safe) => findLinkedLegacies(safe, lookupChain),
  isKnownAccount,
};

export function createSignInDeps(): SignInDeps & { createPasskey: typeof createPasskey } {
  return {
    migrationStorage: secureKeyValueStorage,
    sessionStorage: secureSessionStorage,
    randomChallenge: () => randomChallengeFrom(randomBytes),
    getDiscoverableAssertion,
    signWithCredential: signWithPasskey,
    keyChain,
    identityChain,
    createPasskey,
  };
}

const adapterDeps: AdapterDeps = {
  sign: signWithPasskey,
  isSafeDeployed: (safe) => isSafeDeployed(safe),
  sendUserOp: (args) => sendPasskeyUserOp(args),
};

/**
 * The thirdweb wallet (id "adapter") for a passkey session. Disconnecting it (every existing
 * `useDisconnect` logout site) clears ONLY `passkey_session_v1`; the passkey stays on the device.
 */
export function createPasskeyWallet(session: PasskeySession): Wallet<'adapter'> {
  const opts = passkeyWalletOptions(session, {
    client,
    chain,
    deps: adapterDeps,
    clearSession: async () => {
      await clearPasskeySession(secureSessionStorage);
      // Also end the API session token server-side (best effort, never blocks the sign-out).
      void passkeyApiSession.revoke().catch(() => undefined);
    },
  });
  return createWalletAdapter({ ...opts, adaptedAccount: opts.adaptedAccount as unknown as Account });
}

/** Makes the passkey session the app's active wallet (`useActiveAccount()` → the identity). */
export async function activatePasskeySession(
  session: PasskeySession,
  setActiveWallet: (w: Wallet) => Promise<void>,
): Promise<void> {
  await setActiveWallet(createPasskeyWallet(session) as Wallet);
}

export const loadStoredPasskeySession = () => loadPasskeySession(secureSessionStorage);
