/**
 * MaciContext — manages each citizen's MACI BabyJubjub keypair and their MACI
 * sign-up state on chain.
 *
 * Keypair lifecycle:
 *   - Generated on demand via `generateAndStoreKeypair()`.
 *   - Persisted in expo-secure-store (Keychain on iOS, EncryptedSharedPreferences
 *     on Android) under SECURE_KEY. Never touches AsyncStorage.
 *   - Loaded on mount; surfaced via `serializedKeypair` so the UI can decide
 *     "needs onboarding" vs "ready to vote".
 *
 * Sign-up lifecycle:
 *   - Each citizen signs up to MACI exactly once. After signup, MACI assigns a
 *     state index (uint256) to their pubkey hash. The Process circuit needs
 *     that index when the citizen votes.
 *   - We refresh `signUpState` on demand from `MACI.getStateIndex(pubKeyHash)`,
 *     which reverts if the user hasn't signed up yet — we treat the revert as
 *     "not signed up" and clear it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { readContract } from "thirdweb";
import { useActiveAccount } from "thirdweb/react";
import { maciContract } from "@/constants/thirdweb";
import {
  deserializeKeypair,
  generateMaciKeypair,
  serializeKeypair,
  type SerializedKeypair,
  Keypair,
  PubKey,
} from "@/lib/maci";

const SECURE_KEY = "roebel.maci.keypair.v1";

type SignUpState =
  | { status: "unknown" } // not yet checked
  | { status: "needs-keypair" } // no keypair generated yet
  | { status: "needs-signup"; pubKeyHash: bigint } // keypair exists, MACI doesn't know it
  | { status: "signed-up"; pubKeyHash: bigint; stateIndex: bigint };

interface MaciContextShape {
  serializedKeypair: SerializedKeypair | null;
  keypairLoading: boolean;
  signUpState: SignUpState;
  /** Generate a fresh BabyJubjub keypair and persist it in secure storage. */
  generateAndStoreKeypair: () => Promise<SerializedKeypair>;
  /** Wipe the local keypair (use with caution — vote-binding is per-key). */
  clearKeypair: () => Promise<void>;
  /** Re-query `MACI.getStateIndex(...)` for the current keypair. */
  refreshSignUp: () => Promise<void>;
  /** Get a reconstructed Keypair object (decrypted from secure-store). */
  getKeypair: () => Keypair | null;
}

const MaciContext = createContext<MaciContextShape | null>(null);

export function MaciProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const [serializedKeypair, setSerializedKeypair] = useState<SerializedKeypair | null>(null);
  const [keypairLoading, setKeypairLoading] = useState(true);
  const [signUpState, setSignUpState] = useState<SignUpState>({ status: "unknown" });
  const lastCheckedHash = useRef<bigint | null>(null);

  // Load keypair from secure store on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(SECURE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as SerializedKeypair;
          setSerializedKeypair(parsed);
        } else {
          setSignUpState({ status: "needs-keypair" });
        }
      } catch (err) {
        console.warn("[MaciContext] failed to load keypair:", err);
        setSignUpState({ status: "needs-keypair" });
      } finally {
        if (!cancelled) setKeypairLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSignUp = useCallback(async () => {
    if (!serializedKeypair) {
      setSignUpState({ status: "needs-keypair" });
      return;
    }
    try {
      const kp = deserializeKeypair(serializedKeypair);
      const pubKeyHash = kp.pubKey.hash() as bigint;

      // MACI.getStateIndex(pubKeyHash) → uint256. Reverts if not signed up.
      const stateIndex = (await readContract({
        contract: maciContract,
        method: "function getStateIndex(uint256 _pubKeyHash) external view returns (uint256)",
        params: [pubKeyHash],
      })) as bigint;

      lastCheckedHash.current = pubKeyHash;
      setSignUpState({ status: "signed-up", pubKeyHash, stateIndex });
    } catch (err) {
      // Most common cause: the citizen hasn't signed up yet (call reverts).
      const kp = deserializeKeypair(serializedKeypair);
      const pubKeyHash = kp.pubKey.hash() as bigint;
      setSignUpState({ status: "needs-signup", pubKeyHash });
    }
  }, [serializedKeypair]);

  // Refresh signup whenever the keypair changes or wallet reconnects.
  useEffect(() => {
    if (!serializedKeypair) return;
    if (!account) return;
    refreshSignUp().catch((err) => console.warn("[MaciContext] refreshSignUp:", err));
  }, [serializedKeypair, account?.address, refreshSignUp]);

  const generateAndStoreKeypair = useCallback(async () => {
    const fresh = generateMaciKeypair();
    await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(fresh));
    setSerializedKeypair(fresh);
    setSignUpState({
      status: "needs-signup",
      pubKeyHash: deserializeKeypair(fresh).pubKey.hash() as bigint,
    });
    return fresh;
  }, []);

  const clearKeypair = useCallback(async () => {
    await SecureStore.deleteItemAsync(SECURE_KEY);
    setSerializedKeypair(null);
    setSignUpState({ status: "needs-keypair" });
    lastCheckedHash.current = null;
  }, []);

  const getKeypair = useCallback(() => {
    if (!serializedKeypair) return null;
    return deserializeKeypair(serializedKeypair);
  }, [serializedKeypair]);

  const value = useMemo<MaciContextShape>(
    () => ({
      serializedKeypair,
      keypairLoading,
      signUpState,
      generateAndStoreKeypair,
      clearKeypair,
      refreshSignUp,
      getKeypair,
    }),
    [serializedKeypair, keypairLoading, signUpState, generateAndStoreKeypair, clearKeypair, refreshSignUp, getKeypair],
  );

  return <MaciContext.Provider value={value}>{children}</MaciContext.Provider>;
}

export function useMaci(): MaciContextShape {
  const ctx = useContext(MaciContext);
  if (!ctx) throw new Error("useMaci must be used inside <MaciProvider>");
  return ctx;
}
