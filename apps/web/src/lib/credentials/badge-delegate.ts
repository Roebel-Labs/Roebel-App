// The node's badge delegate key: one EOA (CREDENTIAL_BADGE_DELEGATE_KEY) that an org may appoint
// as delegate of its event badge types, so the node can issue small badge batches itself while the
// event runs. It can only ever be a delegate of types whose org appointed it on chain.
// Relative imports only: loaded by `npx tsx --test`.
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** The node key's address (lowercase), or null when the key is not configured. */
export function badgeDelegateAddress(env: Record<string, string | undefined> = process.env): Address | null {
  const key = env.CREDENTIAL_BADGE_DELEGATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  try {
    return privateKeyToAccount(key as `0x${string}`).address.toLowerCase() as Address;
  } catch {
    return null;
  }
}

/** How the node key is named wherever an org sees it (never its address). */
export const BADGE_DELEGATE_LABEL = "Röbel-Server (sofortige Abzeichen)";
