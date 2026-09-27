/**
 * The deterministic thirdweb MACI key derivation (moved verbatim out of context/MaciContext.tsx so
 * "Schlüssel sichern" on a passkey session can reproduce it with the device's silent thirdweb
 * session). Never call it with a passkey account: a WebAuthn signature is randomized, so the key
 * would change every time (= unusable votes).
 */
import { keccak256 } from 'thirdweb/utils';
import { deriveMaciKeypairFromSeed, type SerializedKeypair } from '@/lib/maci';

/** Fixed message signed once per device to deterministically derive the
 *  citizen's MACI voting key. Bump the version suffix only if the derivation
 *  scheme must change (it would mint a new key → requires a fresh signup). */
export const MACI_KEY_DERIVATION_MESSAGE = 'Röbel Bürgerumfrage – Abstimmungsschlüssel v1';

/** signMessage(MACI_KEY_DERIVATION_MESSAGE) → keccak256 → seed → keypair (same wallet, same key). */
export async function deriveMaciKeypairFromWalletSignature(account: {
  signMessage: (args: { message: string }) => Promise<string>;
}): Promise<SerializedKeypair> {
  const signature = await account.signMessage({ message: MACI_KEY_DERIVATION_MESSAGE });
  const seed = BigInt(keccak256(signature as `0x${string}`));
  return deriveMaciKeypairFromSeed(seed);
}
