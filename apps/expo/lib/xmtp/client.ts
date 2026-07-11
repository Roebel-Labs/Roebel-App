/**
 * XMTP client bootstrap.
 *
 * Identity = the user's Gnosis smart account (same deterministic address as
 * Base; the app-wide user key in `users.wallet_address`). Registered as an
 * XMTP SCW identity verified via ERC-1271 against Gnosis (chainId 100) — the
 * chain where every account already transacts gaslessly (Münzen, MACI).
 *
 * Native modules (@xmtp/react-native-sdk, expo-secure-store) are only loaded
 * lazily inside functions: builds older than 2026-07-10 lack them, and this
 * file is statically imported by XmtpContext.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getContract, prepareTransaction, sendTransaction } from 'thirdweb';
import { isContractDeployed } from 'thirdweb/utils';
import type { Account } from 'thirdweb/wallets';
import type {
  Client,
  Signer as XmtpSigner,
  XMTPEnvironment,
} from '@xmtp/react-native-sdk';

import { client as thirdwebClient } from '@/constants/thirdweb';
import { gnosis } from '@/constants/gnosis';
import { fetchXmtpDmsEnabled } from '@/lib/supabase-app-settings';
import { markUserXmtpRegistered } from '@/lib/supabase-users';
import { loadXmtp, type XmtpSdk } from './native';
import { RoebelStickerCodec, TransactionReferenceCodec } from './codecs';

export interface XmtpClientHandle {
  client: Client<any>;
  inboxId: string;
  /** Lowercased smart-account address this client is bound to. */
  wallet: string;
  env: XMTPEnvironment;
  sdk: XmtpSdk;
}

export const XMTP_ENV: XMTPEnvironment =
  (process.env.EXPO_PUBLIC_XMTP_ENV as XMTPEnvironment) || 'production';

const REGISTERED_FLAG_PREFIX = '@xmtp_registered_';
const DB_KEY_PREFIX = 'xmtp_dbkey_';

let handleCache: XmtpClientHandle | null = null;
let bootPromise: Promise<XmtpClientHandle | null> | null = null;

export function getXmtpClient(): XmtpClientHandle | null {
  return handleCache;
}

/**
 * 32-byte local-db encryption key, hex-encoded in the device keychain
 * (expo-secure-store). The SDK never persists this key itself. Keychain
 * entries survive app reinstalls on iOS, which conveniently matches the
 * SQLCipher db being wiped on reinstall (fresh db + same key = fine).
 */
async function getOrCreateDbKey(wallet: string): Promise<Uint8Array> {
  const storeKey = `${DB_KEY_PREFIX}${wallet.toLowerCase()}`;
  let hex: string | null = null;

  let secureStore: typeof import('expo-secure-store') | null = null;
  try {
    secureStore = await import('expo-secure-store');
    hex = await secureStore.getItemAsync(storeKey);
  } catch (err) {
    console.warn('[xmtp] secure store unavailable, falling back to AsyncStorage', err);
  }
  if (!hex && !secureStore) {
    hex = await AsyncStorage.getItem(storeKey);
  }

  if (hex && /^[0-9a-f]{64}$/i.test(hex)) {
    return new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  }

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const newHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (secureStore) {
    await secureStore.setItemAsync(storeKey, newHex);
  } else {
    await AsyncStorage.setItem(storeKey, newHex);
  }
  return bytes;
}

/**
 * ERC-1271 verification requires deployed code at the account address on the
 * verification chain. Thirdweb smart accounts deploy on their first
 * transaction — brand-new users may still be counterfactual on Gnosis, so we
 * deploy with a sponsored no-op self-transfer before registering with XMTP.
 */
async function ensureDeployedOnGnosis(account: Account): Promise<void> {
  const deployed = await isContractDeployed(
    getContract({ client: thirdwebClient, chain: gnosis, address: account.address })
  );
  if (deployed) return;

  console.log('[xmtp] deploying smart account on gnosis before registration');
  await sendTransaction({
    account,
    transaction: prepareTransaction({
      to: account.address,
      value: 0n,
      chain: gnosis,
      client: thirdwebClient,
    }),
  });
}

function makeScwSigner(sdk: XmtpSdk, account: Account): XmtpSigner {
  return {
    getIdentifier: async () => new sdk.PublicIdentity(account.address, 'ETHEREUM'),
    getChainId: () => 100,
    getBlockNumber: () => undefined,
    signerType: () => 'SCW',
    signMessage: async (message: string) => ({
      // inAppWallet smart accounts sign silently (no user prompt) and return
      // a hex signature verifiable via isValidSignature on Gnosis.
      signature: await account.signMessage({ message }),
    }),
  };
}

function buildCodecs(sdk: XmtpSdk) {
  return [
    new sdk.TextCodec(),
    new sdk.ReactionCodec(),
    new sdk.ReadReceiptCodec(),
    new sdk.ReplyCodec(),
    new sdk.StaticAttachmentCodec(),
    new sdk.RemoteAttachmentCodec(),
    new TransactionReferenceCodec(),
    new RoebelStickerCodec(),
  ];
}

export interface BootXmtpOptions {
  /**
   * Allow first-time inbox registration (deploy guard + SCW signature +
   * Client.create). Silent app-start boot passes false so registration only
   * ever happens through the explicit "Private Nachrichten aktivieren" flow.
   */
  allowRegister?: boolean;
  /** Rethrow boot errors instead of settling null (activation UI shows them). */
  rethrow?: boolean;
}

/**
 * Boots (or returns the cached) XMTP client for the given Gnosis smart
 * account. Returns null when the rail is unavailable — kill switch off,
 * native module missing (old build), not yet activated on this device, or
 * boot failure — in which case DMs stay on the Supabase rail. Only throws
 * when opts.rethrow is set.
 */
export async function bootXmtpClient(
  account: Account,
  opts?: BootXmtpOptions
): Promise<XmtpClientHandle | null> {
  const wallet = account.address.toLowerCase();
  if (handleCache?.wallet === wallet) return handleCache;
  if (bootPromise) return bootPromise;

  bootPromise = (async (): Promise<XmtpClientHandle | null> => {
    try {
      if (!(await fetchXmtpDmsEnabled())) {
        console.log('[xmtp] disabled via app_settings kill switch');
        return null;
      }
      const sdk = await loadXmtp();
      if (!sdk) return null;

      const dbEncryptionKey = await getOrCreateDbKey(wallet);
      const options = { env: XMTP_ENV, dbEncryptionKey, codecs: buildCodecs(sdk) };
      const flagKey = `${REGISTERED_FLAG_PREFIX}${wallet}`;
      const registered = await AsyncStorage.getItem(flagKey);

      if (!registered && !opts?.allowRegister) {
        console.log('[xmtp] not yet activated on this device — Supabase rail until user activates');
        return null;
      }

      let xmtpClient: Client<any> | null = null;

      if (registered) {
        try {
          // Already registered on this device: build without any signature.
          xmtpClient = await sdk.Client.build(
            new sdk.PublicIdentity(account.address, 'ETHEREUM'),
            options
          );
        } catch (err) {
          console.warn('[xmtp] build failed (db/key lost?) — re-creating', err);
          if (!opts?.allowRegister) throw err;
        }
      }

      if (!xmtpClient) {
        await ensureDeployedOnGnosis(account);
        xmtpClient = await sdk.Client.create(makeScwSigner(sdk, account), options);
        await AsyncStorage.setItem(flagKey, new Date().toISOString());
        // Rail-selection signal for peers; safe to fire-and-forget.
        markUserXmtpRegistered(wallet).catch(() => {});
      }

      handleCache = {
        client: xmtpClient,
        inboxId: xmtpClient.inboxId,
        wallet,
        env: XMTP_ENV,
        sdk,
      };
      console.log('[xmtp] client ready', { inboxId: xmtpClient.inboxId });
      return handleCache;
    } catch (err) {
      console.error('[xmtp] boot failed — staying on Supabase rail', err);
      if (opts?.rethrow) throw err;
      return null;
    } finally {
      bootPromise = null;
    }
  })();

  return bootPromise;
}

/**
 * Logout teardown: drop the client from memory. The local db (and keychain
 * key) stay — the same user logging back in reuses them via Client.build.
 */
export async function dropXmtpClient(): Promise<void> {
  const handle = handleCache;
  handleCache = null;
  if (!handle) return;
  try {
    await handle.sdk.Client.dropClient(handle.client.installationId);
  } catch (err) {
    console.warn('[xmtp] dropClient failed', err);
  }
}
