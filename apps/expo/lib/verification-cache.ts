import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHED_VERIFICATION_KEY = '@cached_verification';

// userRequests holds raw `request_evidence` rows as returned by
// fetchUserRequests (lib/supabase-verification.ts) — snake_case fields
// (nft_type, attester_signatures, status: 'pending'|'approved'|'rejected',
// ...). This is NOT the camelCase on-chain VerificationRequest shape from
// lib/verification-types.ts; every UI consumer reads the snake_case fields.
type RequestRecord = Record<string, any>;

export type CachedVerification = {
  walletAddress: string;
  hasCitizenNFT: boolean;
  hasAttesterNFT: boolean;
  userRequests: RequestRecord[];
  savedAt: number;
};

/**
 * Last successfully-resolved on-chain verification flags + requests for a
 * wallet, persisted so VerificationContext (and everything gated on
 * hasCitizenNFT — citizen tabs/tiers, posting permissions, proposal gating)
 * hydrates instantly on cold start instead of starting at
 * hasCitizenNFT=false/isLoading=true behind the thirdweb reconnect + the two
 * Gnosis reads. Reconciled with a fresh on-chain read once it lands; cleared
 * on genuine logout.
 */
export async function loadCachedVerification(): Promise<CachedVerification | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_VERIFICATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.walletAddress === 'string' &&
      typeof parsed.hasCitizenNFT === 'boolean' &&
      typeof parsed.hasAttesterNFT === 'boolean' &&
      Array.isArray(parsed.userRequests)
    ) {
      return parsed as CachedVerification;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCachedVerification(v: CachedVerification): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHED_VERIFICATION_KEY, JSON.stringify(v));
  } catch {
    // Non-fatal.
  }
}

export async function clearCachedVerification(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHED_VERIFICATION_KEY);
  } catch {
    // Non-fatal.
  }
}
