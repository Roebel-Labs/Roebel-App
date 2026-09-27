/**
 * XMTP client bootstrap.
 *
 * Identity = the user's smart account (same deterministic address on every EVM
 * chain; the app-wide user key in `users.wallet_address`). Registered as an XMTP
 * SCW identity verified via ERC-1271 on GNOSIS (chainId 100) since the
 * 2026-07-27 consolidation — see XMTP_SIGNER_CHAIN_ID for what that cost.
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

import { client as thirdwebClient, chain as signerChain } from '@/constants/thirdweb';
import { supabase } from '@/lib/supabase';
import { fetchXmtpDmsEnabled } from '@/lib/supabase-app-settings';
import { clearUserXmtpRegistered, markUserXmtpRegistered } from '@/lib/supabase-users';
import {
  XmtpChainLockedError,
  clearXmtpChainLock,
  getXmtpChainLock,
  parseForeignChainLock,
  setXmtpChainLock,
} from './chain-lock';
import { loadXmtp, type XmtpSdk } from './native';
import {
  XMTP_LINK_NEEDS_INSTALLATION_MESSAGE,
  XMTP_LINK_SAFE_NOT_DEPLOYED_MESSAGE,
  XmtpPasskeyLinkNeededError,
  inboxHasIdentity,
  isSafeLinked,
  makeSafeScwSigner,
  planXmtpForPasskey,
  writePasskeyLinkMarker,
  type XmtpPasskeyPlan,
} from './passkey-link';
import { passkeySessionOf } from '@/lib/passkey/active';
import { loadDerivedKeysRuntime } from '@/lib/passkey/load-derived-keys';
import type { PasskeySession } from '@/lib/passkey/session';
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
/** Legacy wallets whose passkey session is waiting for "Nachrichten auf Passkey übertragen". */
const passkeyLinkNeeded = new Set<string>();

/** True when the last boot for `wallet` stopped because its passkey Safe is not linked to the inbox. */
export function xmtpPasskeyLinkNeeded(wallet: string): boolean {
  return passkeyLinkNeeded.has(wallet.toLowerCase());
}

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
 * The chain XMTP verifies this app's SCW signatures on. Gnosis since the
 * 2026-07-27 consolidation.
 *
 * This MUST equal the chain the wallet signs with (`constants/thirdweb.ts`
 * `chain`). A thirdweb smart account stamps its EIP-712 domain with its wallet's
 * chain id; XMTP then calls `isValidSignature` on the chain returned here. If the
 * two disagree, the account computes a different digest and rejects a perfectly
 * valid signature. There is no coherent half-migration — these move together.
 *
 * KNOWN COST, accepted deliberately on 2026-07-27: XMTP binds an SCW identity to
 * the chain it was FIRST registered from and rejects other chains forever after
 * ("Wrong chain id. Initially added with 8453 but now signing from 100" —
 * captured live 2026-07-12). Addresses that already registered on Base therefore
 * lose their XMTP inbox and its history. This was a small, known set (three
 * conversations), and direct messages keep working over the Supabase rail, which
 * is why the trade was worth making rather than keeping every other subsystem on
 * an archived chain. New registrations bind to Gnosis and are unaffected.
 *
 * Handling of the affected wallets lives in ./chain-lock.ts (2026-09-04).
 */
export const XMTP_SIGNER_CHAIN_ID = 100;

/**
 * Local XMTP state is keyed by the signer chain. When that changes, the identity
 * on the network changes too, so any locally cached registration flag or DB
 * belongs to an identity this app can no longer speak as — and reusing it makes
 * the SDK fail in confusing ways instead of simply re-registering.
 */
const SIGNER_CHAIN_MARKER = 'xmtp_signer_chain_id';

/**
 * ERC-1271 verification requires deployed code at the account address on the
 * verification chain. Thirdweb smart accounts deploy on their first transaction,
 * so an account that has only ever received (a migration-minted CitizenNFT, say)
 * is still counterfactual — `isValidSignature` on an address with no code
 * reverts. Deploy it with a sponsored no-op self-transfer first.
 */
async function ensureDeployedForXmtp(account: Account): Promise<void> {
  const deployed = await isContractDeployed(
    getContract({ client: thirdwebClient, chain: signerChain, address: account.address })
  );
  if (deployed) return;

  console.log('[xmtp] deploying smart account on the signer chain before registration');
  await sendTransaction({
    account,
    transaction: prepareTransaction({
      to: account.address,
      value: 0n,
      chain: signerChain,
      client: thirdwebClient,
    }),
  });
}

/**
 * Wipe local XMTP state when the signer chain has changed since it was written.
 *
 * Without this, a device that registered on Base keeps a `registered` flag and an
 * encrypted DB for an identity the app can no longer sign as, and boot fails in
 * ways that read like corruption rather than a migration. Clearing lets the
 * client register cleanly against the new chain — or fall through to the Supabase
 * rail if the network refuses the re-binding.
 */
async function resetLocalStateIfChainChanged(wallet: string): Promise<void> {
  const markerKey = `${SIGNER_CHAIN_MARKER}:${wallet}`;
  const previous = await AsyncStorage.getItem(markerKey);
  const current = String(XMTP_SIGNER_CHAIN_ID);
  if (previous === current) return;

  if (previous !== null) {
    console.log(`[xmtp] signer chain ${previous} -> ${current}; clearing local state`);
    await AsyncStorage.removeItem(`${REGISTERED_FLAG_PREFIX}${wallet}`);
    // A verdict from the network about the OLD signer chain says nothing
    // about the new one.
    await clearXmtpChainLock(wallet);
  }
  await AsyncStorage.setItem(markerKey, current);
}

function makeScwSigner(sdk: XmtpSdk, account: Account): XmtpSigner {
  return {
    getIdentifier: async () => new sdk.PublicIdentity(account.address, 'ETHEREUM'),
    getChainId: () => XMTP_SIGNER_CHAIN_ID,
    getBlockNumber: () => undefined,
    signerType: () => 'SCW',
    signMessage: async (message: string) => ({
      // inAppWallet smart accounts sign silently (no user prompt) and return a
      // hex signature verifiable via isValidSignature on the signer chain.
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

      // Must run BEFORE the registration flag is read: after a chain migration
      // that flag refers to an identity this app can no longer sign as.
      await resetLocalStateIfChainChanged(wallet);

      // The network has told us this wallet's identity lives on another chain.
      // No signature, no RPC, no error: DMs stay on the Supabase rail.
      const chainLock = await getXmtpChainLock(wallet);
      if (chainLock !== null) {
        console.log(`[xmtp] identity bound to chain ${chainLock} on the network — Supabase rail`);
        throw new XmtpChainLockedError(chainLock);
      }

      // Passkey session (lib/xmtp/passkey-link.ts). thirdweb sessions get { kind: 'thirdweb' } and
      // run the unchanged flow below. A legacy identity needs its Safe linked to the inbox first.
      const pk = passkeySessionOf<PasskeySession>(account);
      let plan: XmtpPasskeyPlan = planXmtpForPasskey(pk, false);
      if (pk && plan.kind === 'linkNeeded') {
        const linked = await isSafeLinked({
          legacy: pk.identity,
          safe: pk.safe,
          storage: AsyncStorage,
          inboxIdOf: (a) =>
            sdk.Client.getOrCreateInboxId(new sdk.PublicIdentity(a, 'ETHEREUM'), XMTP_ENV).catch(() => null),
        });
        if (!linked) {
          passkeyLinkNeeded.add(wallet);
          throw new XmtpPasskeyLinkNeededError();
        }
        plan = { kind: 'legacyViaSafe' };
      }
      passkeyLinkNeeded.delete(wallet);

      const dbEncryptionKey = await getOrCreateDbKey(wallet);
      const options = { env: XMTP_ENV, dbEncryptionKey, codecs: buildCodecs(sdk) };
      const flagKey = `${REGISTERED_FLAG_PREFIX}${wallet}`;
      const locallyRegistered = await AsyncStorage.getItem(flagKey);

      // Activation is PERMANENT: consent is proven by the local flag, an
      // explicit activation tap, or — cross-device/reinstall-proof — the
      // wallet's users.xmtp_registered_at set by ANY earlier activation.
      // With consent, boots may silently (re-)create the client; inAppWallet
      // signatures never prompt the user.
      let consented = !!locallyRegistered || !!opts?.allowRegister;
      if (!consented) {
        try {
          const { data } = await supabase
            .from('users')
            .select('xmtp_registered_at')
            .eq('wallet_address', wallet)
            .maybeSingle();
          consented = !!(data as { xmtp_registered_at: string | null } | null)
            ?.xmtp_registered_at;
        } catch {
          consented = false;
        }
      }
      if (!consented) {
        console.log('[xmtp] not yet activated — Supabase rail until user activates');
        return null;
      }

      let xmtpClient: Client<any> | null = null;

      if (locallyRegistered) {
        try {
          // Already registered on this device: build without any signature.
          xmtpClient = await sdk.Client.build(
            new sdk.PublicIdentity(account.address, 'ETHEREUM'),
            options
          );
        } catch (err) {
          console.warn('[xmtp] build failed (db/key lost?) — re-creating silently', err);
        }
      }

      // A passkey signature is a fingerprint prompt: never register silently at app start.
      if (!xmtpClient && pk && !opts?.allowRegister) {
        console.log('[xmtp] passkey session without a local installation — waiting for activation');
        return null;
      }

      if (!xmtpClient) {
        let signer: XmtpSigner;
        if (!pk) {
          await ensureDeployedForXmtp(account);
          signer = makeScwSigner(sdk, account);
        } else {
          // The sponsor refuses the thirdweb "deploy by self-transfer"; a passkey Safe is deployed
          // by its first sponsored action (the handover for migrated people).
          const rt = await loadDerivedKeysRuntime();
          if (!(await rt.isPasskeySafeDeployed(pk.safe))) throw new Error(XMTP_LINK_SAFE_NOT_DEPLOYED_MESSAGE);
          signer =
            plan.kind === 'safeIdentity'
              ? makeScwSigner(sdk, account) // the adapter signs as the Safe itself
              : (makeSafeScwSigner(sdk, pk.safe, (h) => rt.signHashAsSafe(pk, h)) as unknown as XmtpSigner);
        }
        try {
          xmtpClient = await sdk.Client.create(signer, options);
        } catch (err) {
          const lock = parseForeignChainLock(err);
          if (!lock) throw err;
          // Permanent per XMTP's identity rules: remember it, stop advertising
          // this wallet as XMTP-reachable, and never sign for it again.
          console.warn(
            `[xmtp] network refuses chain ${lock.signingChainId}: identity was registered on chain ` +
              `${lock.boundChainId}. Marking chain-locked; DMs stay on the Supabase rail.`
          );
          await setXmtpChainLock(wallet, lock.boundChainId);
          clearUserXmtpRegistered(wallet).catch(() => {});
          throw new XmtpChainLockedError(lock.boundChainId);
        }
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
      if (err instanceof XmtpChainLockedError || err instanceof XmtpPasskeyLinkNeededError) {
        if (opts?.rethrow) throw err;
        return null;
      }
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

/**
 * "Nachrichten auf Passkey übertragen": adds the passkey Safe as a second SCW identity to the
 * legacy account's EXISTING inbox (`client.addAccount`, SDK 5.7.0). Needs an installation of
 * that inbox on this device (the booted client, or its local db via Client.build — no
 * signature); the Safe signs once (fingerprint). Works from a thirdweb OR a passkey session.
 * Idempotent: an already linked Safe only refreshes the device marker. Throws German errors.
 */
export async function linkPasskeySafeToInbox(session: PasskeySession): Promise<void> {
  const sdk = await loadXmtp();
  if (!sdk) throw new Error('Private Nachrichten brauchen die neueste App-Version.');
  if (!(await fetchXmtpDmsEnabled())) throw new Error('Private Nachrichten sind gerade abgeschaltet.');
  const wallet = session.identity.toLowerCase();
  if (session.identity.toLowerCase() === session.safe.toLowerCase()) return; // Safe identity: nothing to link

  let client: Client<any> | null = handleCache?.wallet === wallet ? handleCache.client : null;
  if (!client) {
    if (!(await AsyncStorage.getItem(`${REGISTERED_FLAG_PREFIX}${wallet}`))) {
      throw new Error(XMTP_LINK_NEEDS_INSTALLATION_MESSAGE);
    }
    const dbEncryptionKey = await getOrCreateDbKey(wallet);
    try {
      client = await sdk.Client.build(new sdk.PublicIdentity(session.identity, 'ETHEREUM'), {
        env: XMTP_ENV,
        dbEncryptionKey,
        codecs: buildCodecs(sdk),
      });
    } catch {
      throw new Error(XMTP_LINK_NEEDS_INSTALLATION_MESSAGE);
    }
  }

  const rt = await loadDerivedKeysRuntime();
  if (!(await rt.isPasskeySafeDeployed(session.safe))) throw new Error(XMTP_LINK_SAFE_NOT_DEPLOYED_MESSAGE);

  const before = await client.inboxState(true);
  if (!inboxHasIdentity(before.identities, session.safe)) {
    const signer = makeSafeScwSigner(sdk, session.safe, (h) => rt.signHashAsSafe(session, h));
    // allowReassignInboxId = false: never move a Safe that already belongs to ANOTHER inbox.
    await client.addAccount(signer as unknown as XmtpSigner, false);
    const after = await client.inboxState(true);
    if (!inboxHasIdentity(after.identities, session.safe)) {
      throw new Error('Das Netzwerk hat die Übertragung nicht bestätigt. Bitte versuche es erneut.');
    }
  }
  await writePasskeyLinkMarker(AsyncStorage, wallet, session.safe);
  passkeyLinkNeeded.delete(wallet);
}

/** Is the Safe already linked to the legacy inbox (device marker or network lookup, no signature)? */
export async function isPasskeySafeLinkedToInbox(session: PasskeySession): Promise<boolean | null> {
  const sdk = await loadXmtp();
  if (!sdk) return null;
  if (session.identity.toLowerCase() === session.safe.toLowerCase()) return true;
  return isSafeLinked({
    legacy: session.identity,
    safe: session.safe,
    storage: AsyncStorage,
    inboxIdOf: (a) => sdk.Client.getOrCreateInboxId(new sdk.PublicIdentity(a, 'ETHEREUM'), XMTP_ENV).catch(() => null),
  });
}
