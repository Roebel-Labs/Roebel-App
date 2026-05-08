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
 *     state index (uint256) to their pubkey hash.
 *   - MACI v2 has NO public view to look up an existing user's stateIndex from
 *     their pubkey (that's a v3-only addition). The canonical sources are the
 *     `SignUp` event log emitted at signup time.
 *   - We resolve `signUpState` in three layers (fastest first):
 *       1. Local cache: serializedKeypair.stateIndex matches the current
 *          pubKeyHash → use it directly. No network.
 *       2. Event scan: query MACI's SignUp logs filtered by the indexed
 *          pubX/pubY topics. If we find one, persist its stateIndex into
 *          secure-store so future sessions hit the cache.
 *       3. Otherwise: needs-signup.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { getContractEvents, prepareEvent } from "thirdweb";
import { useActiveAccount } from "thirdweb/react";
import { MACI_DEPLOY_BLOCK, maciContract } from "@/constants/thirdweb";
import {
  deserializeKeypair,
  generateMaciKeypair,
  type SerializedKeypair,
  Keypair,
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
  generateAndStoreKeypair: () => Promise<SerializedKeypair>;
  clearKeypair: () => Promise<void>;
  refreshSignUp: () => Promise<void>;
  /** Optimistically promote state to `signed-up` after a confirmed signUp tx,
   *  using the stateIndex parsed from the SignUp event log. Also persists
   *  the stateIndex to secure-store so cold-starts can skip the chain. */
  markSignedUp: (pubKeyHash: bigint, stateIndex: bigint) => Promise<void>;
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

  /** Persist a keypair update + return the new serialized form. */
  const persistKeypair = useCallback(async (next: SerializedKeypair) => {
    await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(next));
    setSerializedKeypair(next);
    return next;
  }, []);

  const refreshSignUp = useCallback(async () => {
    if (!serializedKeypair) {
      setSignUpState({ status: "needs-keypair" });
      return;
    }

    const kp = deserializeKeypair(serializedKeypair);
    const pubKeyHash = kp.pubKey.hash() as bigint;
    const pubX = BigInt(serializedKeypair.pubX);
    const pubY = BigInt(serializedKeypair.pubY);

    // Layer 1 — local cache. Fast path: secure-store already knows the
    // stateIndex for this exact keypair.
    if (
      serializedKeypair.stateIndex !== undefined &&
      serializedKeypair.pubKeyHash === pubKeyHash.toString()
    ) {
      const stateIndex = BigInt(serializedKeypair.stateIndex);
      lastCheckedHash.current = pubKeyHash;
      setSignUpState({ status: "signed-up", pubKeyHash, stateIndex });
      console.log("[MaciContext] refreshSignUp: cache hit", { stateIndex: stateIndex.toString() });
      return;
    }

    // Layer 2 — event scan. MACI v2 has no getStateIndex(pubKeyHash) view, so
    // we filter SignUp logs by the indexed pubX/pubY topics. Each pubkey can
    // appear at most once (the gatekeeper enforces uniqueness).
    try {
      const signUpEvent = prepareEvent({
        signature:
          "event SignUp(uint256 _stateIndex, uint256 indexed _userPubKeyX, uint256 indexed _userPubKeyY, uint256 _voiceCreditBalance, uint256 _timestamp)",
        filters: { _userPubKeyX: pubX, _userPubKeyY: pubY },
      });
      const events = await getContractEvents({
        contract: maciContract,
        events: [signUpEvent],
        fromBlock: MACI_DEPLOY_BLOCK,
      });

      if (events.length > 0) {
        const ev = events[0] as unknown as { args: { _stateIndex?: bigint } };
        const stateIndex = ev.args._stateIndex ?? 0n;
        // Persist for future cold starts.
        await persistKeypair({
          ...serializedKeypair,
          stateIndex: stateIndex.toString(),
          pubKeyHash: pubKeyHash.toString(),
        });
        lastCheckedHash.current = pubKeyHash;
        setSignUpState({ status: "signed-up", pubKeyHash, stateIndex });
        console.log("[MaciContext] refreshSignUp: event scan hit", { stateIndex: stateIndex.toString() });
        return;
      }

      // No log found.
      setSignUpState({ status: "needs-signup", pubKeyHash });
      console.log("[MaciContext] refreshSignUp: no event, status=needs-signup");
    } catch (err) {
      console.warn("[MaciContext] refreshSignUp: event scan failed", err);
      setSignUpState({ status: "needs-signup", pubKeyHash });
    }
  }, [serializedKeypair, persistKeypair]);

  // Refresh signup whenever the keypair changes or wallet reconnects.
  useEffect(() => {
    if (!serializedKeypair) return;
    if (!account) return;
    refreshSignUp().catch((err) => console.warn("[MaciContext] refreshSignUp:", err));
  }, [serializedKeypair, account?.address, refreshSignUp]);

  const markSignedUp = useCallback(
    async (pubKeyHash: bigint, stateIndex: bigint) => {
      if (serializedKeypair) {
        await persistKeypair({
          ...serializedKeypair,
          stateIndex: stateIndex.toString(),
          pubKeyHash: pubKeyHash.toString(),
        });
      }
      lastCheckedHash.current = pubKeyHash;
      setSignUpState({ status: "signed-up", pubKeyHash, stateIndex });
    },
    [serializedKeypair, persistKeypair],
  );

  const generateAndStoreKeypair = useCallback(async () => {
    const fresh = generateMaciKeypair();
    const persisted = await persistKeypair(fresh);
    setSignUpState({
      status: "needs-signup",
      pubKeyHash: deserializeKeypair(fresh).pubKey.hash() as bigint,
    });
    return persisted;
  }, [persistKeypair]);

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
      markSignedUp,
      getKeypair,
    }),
    [serializedKeypair, keypairLoading, signUpState, generateAndStoreKeypair, clearKeypair, refreshSignUp, markSignedUp, getKeypair],
  );

  return <MaciContext.Provider value={value}>{children}</MaciContext.Provider>;
}

export function useMaci(): MaciContextShape {
  const ctx = useContext(MaciContext);
  if (!ctx) throw new Error("useMaci must be used inside <MaciProvider>");
  return ctx;
}
