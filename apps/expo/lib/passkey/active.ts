/**
 * Is the app running on a passkey session? thirdweb's `createWalletAdapter` gives the passkey
 * wallet the id "adapter" (signin-runtime.ts); no other wallet in this app uses that id.
 * Pure module: safe to import from any context.
 */
export const PASSKEY_WALLET_ID = 'adapter';

export function isPasskeyWallet(wallet: { id?: string } | null | undefined): boolean {
  return wallet?.id === PASSKEY_WALLET_ID;
}

/**
 * Property on the adapter account that carries its passkey session. thirdweb's wallet adapter
 * hands out this very object from `useActiveAccount()` (createWalletAdapter's getAccount returns
 * `adaptedAccount`), so non-React code that only receives an `account` (Nostr identity,
 * commitment salt, evidence encryption) can tell a passkey session apart and never derive a key
 * from a randomized passkey signature.
 */
export const PASSKEY_SESSION_PROP = '__passkeySession';

/** Minimal session shape (the full type lives in session.ts; kept structural so this file stays import-free). */
export type PasskeySessionLike = { credentialId: string; safe: string; identity: string };

/** The passkey session behind `account`, or null for a thirdweb (or any other) account. */
export function passkeySessionOf<T extends PasskeySessionLike = PasskeySessionLike>(account: unknown): T | null {
  const s = (account as Record<string, unknown> | null | undefined)?.[PASSKEY_SESSION_PROP];
  return s && typeof s === 'object' ? (s as T) : null;
}
