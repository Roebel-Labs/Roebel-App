/**
 * Real-world wiring for "E-Mail oder Google als Helfer" (pure logic: recovery-helper.ts).
 * Load lazily; only preview-gated passkey screens import it.
 *
 * The thirdweb login runs on a SEPARATE inAppWallet object that is never handed to the connection
 * manager (same technique as key-completion's "Einmal mit Google/E-Mail bestätigen"), so the
 * active session — the passkey adapter — never changes. thirdweb keeps one connector (and one
 * storage) per client id, so the login is written to the device's thirdweb storage like any
 * login. Therefore, once the helper's address is known, `endHelperSession` logs that helper out
 * again: a cold start must never restore the helper as the app user. Callers only run this while
 * NO thirdweb session is the active wallet (checked in the UI).
 *
 * Gas: the helper's own confirmRecovery is a normal thirdweb smart-account transaction
 * (sponsorGas: true → thirdweb's bundler + paymaster on Gnosis). It never reaches our passkey
 * sponsor route, so the preview paymaster and its policy are not involved.
 */
import { prepareTransaction, sendAndConfirmTransaction } from 'thirdweb';
import type { Account, Wallet } from 'thirdweb/wallets';
import { getUserEmail, inAppWallet, preAuthenticate } from 'thirdweb/wallets/in-app';
import type { Address, Hex } from 'viem';
import { client } from '@/constants/thirdweb';
import { gnosis } from '@/constants/gnosis';
import { redirectUrl } from '@/constants/wallets';
import * as SecureStore from '@/lib/storage/secureStorage';
import { readGuardians } from './guardians';
import { HELPERS_STORE_KEY, maskEmail, parseHelpers, withHelper, type HelperKind, type HelperMeta } from './recovery-helper';

const HELPER_TIMEOUT_MS = 30_000;
const CONFIRM_TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** A fresh helper wallet object: Gnosis smart account, gasless via thirdweb. No phone login. */
export function createHelperWallet(): Wallet<'inApp'> {
  return inAppWallet({
    auth: { options: ['google', 'apple', 'email'], redirectUrl },
    smartAccount: { chain: gnosis, sponsorGas: true },
  });
}

export type HelperLogin =
  | { strategy: 'google' }
  | { strategy: 'apple' }
  | { strategy: 'email'; email: string; verificationCode: string };

export type HelperSession = { wallet: Wallet<'inApp'>; account: Account; meta: HelperMeta };

/** Step 1 of the E-Mail login: send the code (stateless thirdweb OTP call). */
export async function sendHelperEmailCode(email: string): Promise<void> {
  await withTimeout(preAuthenticate({ client, strategy: 'email', email }), HELPER_TIMEOUT_MS, 'Zeitüberschreitung beim Senden des Codes.');
}

/** The thirdweb login on a separate wallet object; returns the smart account + masked identity. */
export async function signInHelper(login: HelperLogin): Promise<HelperSession> {
  const wallet = createHelperWallet();
  const connect =
    login.strategy === 'email'
      ? wallet.connect({ client, chain: gnosis, strategy: 'email', email: login.email, verificationCode: login.verificationCode } as any)
      : wallet.connect({ client, chain: gnosis, strategy: login.strategy, redirectUrl } as any);
  // OAuth waits for the browser round-trip; the E-Mail code path gets a deadline.
  const account = login.strategy === 'email' ? await withTimeout(connect, HELPER_TIMEOUT_MS, 'Zeitüberschreitung bei der Anmeldung.') : await connect;
  let email: string | null = login.strategy === 'email' ? login.email : null;
  if (!email) {
    email = (await withTimeout(getUserEmail({ client }), 10_000, 'timeout').catch(() => undefined)) ?? null;
  }
  const kind: HelperKind = login.strategy;
  return { wallet, account, meta: { kind, masked: maskEmail(email) } };
}

/** Logs the helper out of this device's thirdweb storage again (best effort, never throws). */
export async function endHelperSession(session: Pick<HelperSession, 'wallet'> | null | undefined): Promise<void> {
  if (!session) return;
  try {
    await session.wallet.disconnect();
  } catch {
    // Nothing to undo: the passkey session never depended on it.
  }
}

export async function readGuardiansOf(wallet: Address): Promise<Address[]> {
  return [...(await readGuardians(wallet))];
}

/** The helper's own on-chain confirmation, paid by thirdweb's sponsorship (sponsorGas: true). */
export async function sendHelperConfirm(account: Account, call: { to: Address; data: Hex }): Promise<Hex> {
  const transaction = prepareTransaction({ client, chain: gnosis, to: call.to, data: call.data, value: 0n });
  const receipt = await withTimeout(
    sendAndConfirmTransaction({ account, transaction }),
    CONFIRM_TIMEOUT_MS,
    'Zeitüberschreitung bei der Bestätigung.',
  );
  if (receipt.status !== 'success') throw new Error('confirmRecovery reverted');
  return receipt.transactionHash;
}

// ---------------------------------------------------------------------------
// Local helper labels (kind + masked identity; never the raw email)
// ---------------------------------------------------------------------------

export async function loadHelpers(): Promise<Record<string, HelperMeta>> {
  try {
    return parseHelpers(await SecureStore.getItemAsync(HELPERS_STORE_KEY));
  } catch {
    return {};
  }
}

export async function saveHelper(address: Address, meta: HelperMeta): Promise<void> {
  const next = withHelper(await loadHelpers(), address, meta);
  await SecureStore.setItemAsync(HELPERS_STORE_KEY, JSON.stringify(next));
}
