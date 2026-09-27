/**
 * Is the app running on a passkey session? thirdweb's `createWalletAdapter` gives the passkey
 * wallet the id "adapter" (signin-runtime.ts); no other wallet in this app uses that id.
 * Pure module: safe to import from any context.
 */
export const PASSKEY_WALLET_ID = 'adapter';

export function isPasskeyWallet(wallet: { id?: string } | null | undefined): boolean {
  return wallet?.id === PASSKEY_WALLET_ID;
}
