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
import { keccak256 } from "thirdweb/utils";
import { useActiveAccount } from "thirdweb/react";
import { MACI_DEPLOY_BLOCK, maciContract } from "@/constants/thirdweb";
import {
  deserializeKeypair,
  deriveMaciKeypairFromSeed,
  type SerializedKeypair,
  Keypair,
} from "@/lib/maci";

const SECURE_KEY = "roebel.maci.keypair.v1";
const VOTES_KEY = "roebel.maci.votes.v1";

/** Fixed message signed once per device to deterministically derive the
 *  citizen's MACI voting key. Bump the version suffix only if the derivation
 *  scheme must change (it would mint a new key → requires a fresh signup). */
const KEY_DERIVATION_MESSAGE = "Röbel Bürgerumfrage – Abstimmungsschlüssel v1";

type SignUpState =
  | { status: "unknown" } // not yet checked
  | { status: "needs-keypair" } // no keypair generated yet
  | { status: "needs-signup"; pubKeyHash: bigint } // keypair exists, MACI doesn't know it
  | { status: "signed-up"; pubKeyHash: bigint; stateIndex: bigint };

/**
 * Locally-cached record of the citizen's most recent vote on a poll.
 *
 * MACI's process circuit takes the highest-nonce signed command per voter, so
 * the LATEST publishMessage wins. We persist what they actually picked so the
 * UI can show "Du hast Dafür gestimmt" after a re-render — neither the Poll
 * contract nor anyone else can decrypt their choice. This is a UX cache, not
 * authoritative state. Wiped on app reinstall (acceptable: revoting is free
 * until the deadline).
 */
export interface VoteRecord {
  pollAddress: string;   // lower-cased
  optionIndex: number;   // VoteType: 0=Against, 1=For, 2=Abstain
  nonce: string;         // bigint serialized as decimal string
  txHash: string;
  votedAt: number;       // epoch seconds (Date.now() / 1000)
}

type VotesMap = Record<string, VoteRecord>;

interface MaciContextShape {
  serializedKeypair: SerializedKeypair | null;
  keypairLoading: boolean;
  signUpState: SignUpState;
  generateAndStoreKeypair: () => Promise<SerializedKeypair>;
  clearKeypair: () => Promise<void>;
  /** Re-resolve sign-up state and return the resolved value, so callers can act
   *  on the *actual* result rather than the stale closure `signUpState`. */
  refreshSignUp: () => Promise<SignUpState>;
  /** Optimistically promote state to `signed-up` after a confirmed signUp tx,
   *  using the stateIndex parsed from the SignUp event log. Also persists
   *  the stateIndex to secure-store so cold-starts can skip the chain. */
  markSignedUp: (pubKeyHash: bigint, stateIndex: bigint) => Promise<void>;
  getKeypair: () => Keypair | null;
  /** Record the citizen's latest vote on a poll. Persisted to secure-store
   *  so re-opening the app shows "Du hast … gestimmt" without a chain read. */
  recordVote: (pollAddress: string, optionIndex: number, nonce: bigint, txHash: string) => Promise<void>;
  /** Latest cached vote for this poll, or null if none recorded on this device. */
  getLastVote: (pollAddress: string) => VoteRecord | null;
  /** Suggested nonce for the next publishMessage on this poll. Returns
   *  lastVote.nonce + 1 if a vote exists, else 1n — so re-voting bumps the
   *  nonce monotonically across cold-starts. */
  getNextNonce: (pollAddress: string) => bigint;
}

const MaciContext = createContext<MaciContextShape | null>(null);

export function MaciProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const [serializedKeypair, setSerializedKeypair] = useState<SerializedKeypair | null>(null);
  const [keypairLoading, setKeypairLoading] = useState(true);
  const [signUpState, setSignUpState] = useState<SignUpState>({ status: "unknown" });
  const [votes, setVotes] = useState<VotesMap>({});
  const lastCheckedHash = useRef<bigint | null>(null);

  // Load keypair + votes from secure store on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawKeypair, rawVotes] = await Promise.all([
          SecureStore.getItemAsync(SECURE_KEY),
          SecureStore.getItemAsync(VOTES_KEY),
        ]);
        if (cancelled) return;
        if (rawKeypair) {
          setSerializedKeypair(JSON.parse(rawKeypair) as SerializedKeypair);
        } else {
          setSignUpState({ status: "needs-keypair" });
        }
        if (rawVotes) {
          try {
            setVotes(JSON.parse(rawVotes) as VotesMap);
          } catch (err) {
            console.warn("[MaciContext] failed to parse votes cache:", err);
          }
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

  const refreshSignUp = useCallback(async (): Promise<SignUpState> => {
    if (!serializedKeypair) {
      const s: SignUpState = { status: "needs-keypair" };
      setSignUpState(s);
      return s;
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
      const s: SignUpState = { status: "signed-up", pubKeyHash, stateIndex };
      setSignUpState(s);
      console.log("[MaciContext] refreshSignUp: cache hit", { stateIndex: stateIndex.toString() });
      return s;
    }

    // Layer 2 — event scan. MACI v2 has no getStateIndex(pubKeyHash) view, so
    // we filter SignUp logs by the indexed pubX/pubY topics. Each pubkey can
    // appear at most once (the gatekeeper enforces uniqueness).
    //
    // CRITICAL: distinguish "scan succeeded, no event" (→ needs-signup) from
    // "scan failed" (RPC error/timeout). A transient failure must NOT be
    // reported as needs-signup — that's what previously hid the vote buttons
    // from already-registered citizens. On failure we keep `unknown` so the UI
    // can retry instead of falsely prompting another signup.
    const signUpEvent = prepareEvent({
      signature:
        "event SignUp(uint256 _stateIndex, uint256 indexed _userPubKeyX, uint256 indexed _userPubKeyY, uint256 _voiceCreditBalance, uint256 _timestamp)",
      filters: { _userPubKeyX: pubX, _userPubKeyY: pubY },
    });

    const MAX_ATTEMPTS = 3;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
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
          const s: SignUpState = { status: "signed-up", pubKeyHash, stateIndex };
          setSignUpState(s);
          console.log("[MaciContext] refreshSignUp: event scan hit", { stateIndex: stateIndex.toString() });
          return s;
        }

        // Scan genuinely succeeded with zero matches → not signed up.
        const s: SignUpState = { status: "needs-signup", pubKeyHash };
        setSignUpState(s);
        console.log("[MaciContext] refreshSignUp: no event, status=needs-signup");
        return s;
      } catch (err) {
        lastErr = err;
        console.warn(`[MaciContext] refreshSignUp: scan attempt ${attempt + 1}/${MAX_ATTEMPTS} failed`, err);
        // Linear backoff before retrying the RPC.
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }

    // All attempts errored — do NOT claim needs-signup. Stay `unknown` so the
    // caller surfaces a retry rather than a misleading "please sign up" state.
    console.warn("[MaciContext] refreshSignUp: scan failed after retries", lastErr);
    const s: SignUpState = { status: "unknown" };
    setSignUpState(s);
    return s;
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
    // Migration shim: if this device already has a key, keep it. Older installs
    // minted a RANDOM key that may already be registered on-chain — overwriting
    // it would orphan that registration. New installs fall through to the
    // deterministic, wallet-derived path below.
    if (serializedKeypair) return serializedKeypair;

    if (!account) {
      throw new Error("Bitte verbinde zuerst dein Wallet.");
    }

    // Derive the voting key deterministically from a wallet signature so the
    // same wallet reproduces the same key on every device / after a reinstall.
    const signature = await account.signMessage({ message: KEY_DERIVATION_MESSAGE });
    const seed = BigInt(keccak256(signature as `0x${string}`));
    const derived = deriveMaciKeypairFromSeed(seed);

    const persisted = await persistKeypair(derived);
    setSignUpState({
      status: "needs-signup",
      pubKeyHash: deserializeKeypair(derived).pubKey.hash() as bigint,
    });
    return persisted;
  }, [account, serializedKeypair, persistKeypair]);

  const clearKeypair = useCallback(async () => {
    await SecureStore.deleteItemAsync(SECURE_KEY);
    await SecureStore.deleteItemAsync(VOTES_KEY);
    setSerializedKeypair(null);
    setSignUpState({ status: "needs-keypair" });
    setVotes({});
    lastCheckedHash.current = null;
  }, []);

  const getKeypair = useCallback(() => {
    if (!serializedKeypair) return null;
    return deserializeKeypair(serializedKeypair);
  }, [serializedKeypair]);

  const recordVote = useCallback(
    async (pollAddress: string, optionIndex: number, nonce: bigint, txHash: string) => {
      const key = pollAddress.toLowerCase();
      const next: VotesMap = {
        ...votes,
        [key]: {
          pollAddress: key,
          optionIndex,
          nonce: nonce.toString(),
          txHash,
          votedAt: Math.floor(Date.now() / 1000),
        },
      };
      setVotes(next);
      try {
        await SecureStore.setItemAsync(VOTES_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn("[MaciContext] failed to persist vote record:", err);
      }
    },
    [votes],
  );

  const getLastVote = useCallback(
    (pollAddress: string): VoteRecord | null => votes[pollAddress.toLowerCase()] ?? null,
    [votes],
  );

  const getNextNonce = useCallback(
    (pollAddress: string): bigint => {
      const last = votes[pollAddress.toLowerCase()];
      if (!last) return 1n;
      try {
        return BigInt(last.nonce) + 1n;
      } catch {
        return 1n;
      }
    },
    [votes],
  );

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
      recordVote,
      getLastVote,
      getNextNonce,
    }),
    [serializedKeypair, keypairLoading, signUpState, generateAndStoreKeypair, clearKeypair, refreshSignUp, markSignedUp, getKeypair, recordVote, getLastVote, getNextNonce],
  );

  return <MaciContext.Provider value={value}>{children}</MaciContext.Provider>;
}

export function useMaci(): MaciContextShape {
  const ctx = useContext(MaciContext);
  if (!ctx) throw new Error("useMaci must be used inside <MaciProvider>");
  return ctx;
}
