// Canonical citizenship check — ALWAYS use this to gate citizen-only features.
//
// WHY: there are two answers to "is this a citizen?": the on-chain CitizenNFT (the source of
// truth) and the cached DB flag `users.is_verified_citizen`. The DB flag DRIFTS (e.g. it's
// false for citizens verified on Gnosis), so gating on it hides/breaks features for real
// citizens. This hook reads the on-chain NFT, so it can never go stale.
//
// RULE:
//  - Client gating  → use `useIsCitizen()` (never read `is_verified_citizen` directly).
//  - Server gating  → edge functions must re-check `CitizenNFT.hasCitizenNFT` on-chain too
//                     (defense-in-depth — a stale client flag must never grant access).
//  - `users.is_verified_citizen` is a DISPLAY/ANALYTICS cache only, never an authorization gate.
import { useVerificationContext } from "@/context/VerificationContext";

/** True iff the connected wallet holds the soulbound CitizenNFT (on-chain truth). */
export function useIsCitizen(): boolean {
  const { hasCitizenNFT } = useVerificationContext();
  return !!hasCitizenNFT;
}
