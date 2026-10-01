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
 *       2. Lookup: MACI's SignUp log filtered by the indexed pubX/pubY
 *          topics — one explorer request, RPC window scan as fallback
 *          (lib/maci-signup-lookup.ts). If we find one, persist its stateIndex
 *          into secure-store so future sessions hit the cache.
 *       3. July-key recovery: no SignUp for this key but the CitizenNFT token
 *          is already registered → re-derive the Base-signed July key
 *          (lib/maci-legacy-key.ts) and adopt it if it has a SignUp.
 *       4. Otherwise: needs-signup (legacyKeyLost when step 3 found nothing).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "@/lib/storage/secureStorage";
import { getContract, getContractEvents, prepareEvent, readContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { keccak256 } from "thirdweb/utils";
import { getRpcClient, eth_blockNumber } from "thirdweb/rpc";
import { useActiveAccount } from "thirdweb/react";
import { inAppWallet } from "thirdweb/wallets/in-app";
import { citizenNFTContract, client, MACI_DEPLOY_BLOCK, maciReadContract } from "@/constants/thirdweb";
import { gnosisRead } from "@/constants/gnosis";
import { redirectUrl } from "@/constants/wallets";
import {
  findSignUpStateIndex,
  lookupSignUpViaExplorer,
  lookupSignUpViaRpcScan,
  resolveSignUpWithRecovery,
  type LookupResult,
} from "@/lib/maci-signup-lookup";
import {
  buildLegacySignatureCandidates,
  connectLegacyBaseSigner,
  seedFromSignature,
} from "@/lib/maci-legacy-key";
import {
  deserializeKeypair,
  deriveMaciKeypairFromSeed,
  type SerializedKeypair,
  Keypair,
} from "@/lib/maci";
import { chooseStoredKeypair, maciKeypairAccountKey, pickLastVote } from "@/lib/vote-flow";

const SECURE_KEY = "roebel.maci.keypair.v1";
const VOTES_KEY = "roebel.maci.votes.v1";

/** Fixed message signed once per device to deterministically derive the
 *  citizen's MACI voting key. Bump the version suffix only if the derivation
 *  scheme must change (it would mint a new key → requires a fresh signup). */
const KEY_DERIVATION_MESSAGE = "Röbel Bürgerumfrage – Abstimmungsschlüssel v1";

type SignUpState =
  | { status: "unknown" } // not yet checked
  | { status: "needs-keypair" } // no keypair generated yet
  // keypair exists, MACI doesn't know it. `legacyKeyLost`: the citizen's token
  // is already registered but neither this key nor the re-derived July (Base)
  // key has a SignUp → the original key is gone; support has to help.
  | { status: "needs-signup"; pubKeyHash: bigint; legacyKeyLost?: boolean }
  | { status: "signed-up"; pubKeyHash: bigint; stateIndex: bigint };

interface RefreshSignUpOptions {
  /** signUp just reverted AlreadyRegistered → go straight to key recovery. */
  alreadyRegistered?: boolean;
}

interface LegacyCandidate {
  pubX: bigint;
  pubY: bigint;
  keypair: SerializedKeypair;
}

// SignUpTokenGatekeeper (→CitizenNFTv2) — read-only, for registeredTokenIds.
const MACI_GATEKEEPER_ADDRESS =
  process.env.EXPO_PUBLIC_MACI_GATEKEEPER || "0xc4B9E45F0e84BC0CDe930CE888E4D0e38184f277";
const maciGatekeeperReadContract = getContract({
  client,
  address: MACI_GATEKEEPER_ADDRESS,
  chain: gnosisRead,
});

/** Separate in-app wallet on BASE with the same auth options as
 *  constants/wallets.ts. Only ever autoConnect()ed (reuses the stored session)
 *  and NEVER made active — used solely to re-derive the July voting key. */
let legacyBaseWallet: ReturnType<typeof inAppWallet> | null = null;
function getLegacyBaseWallet() {
  if (!legacyBaseWallet) {
    legacyBaseWallet = inAppWallet({
      auth: {
        options: ["email", "phone", "google", "facebook", "apple"],
        redirectUrl,
      },
      smartAccount: { chain: base, sponsorGas: true },
    });
  }
  return legacyBaseWallet;
}

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
  refreshSignUp: (opts?: RefreshSignUpOptions) => Promise<SignUpState>;
  /** Optimistically promote state to `signed-up` after a confirmed signUp tx,
   *  using the stateIndex parsed from the SignUp event log. Also persists
   *  the stateIndex to secure-store so cold-starts can skip the chain. */
  markSignedUp: (pubKeyHash: bigint, stateIndex: bigint) => Promise<void>;
  getKeypair: () => Keypair | null;
  /** Record the citizen's latest vote on a poll. Persisted to secure-store
   *  so re-opening the app shows "Du hast … gestimmt" without a chain read. */
  recordVote: (pollAddress: string, optionIndex: number, nonce: bigint, txHash: string) => Promise<void>;
  /** Latest cached vote for this poll, or null if none recorded on this device.
   *  Includes a just-cast vote that is still being sent (txHash ''). */
  getLastVote: (pollAddress: string) => VoteRecord | null;
  /** Show the just-cast choice right away (in memory, txHash ''), before the
   *  ballot tx settles. Never feeds the nonce. Replaced by recordVote(). */
  markVotePending: (pollAddress: string, optionIndex: number) => void;
  /** Drop the optimistic record (the ballot was never sent). */
  clearVotePending: (pollAddress: string) => void;
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
  // Mirror of `votes` for recordVote: the ballot settles in a detached closure,
  // so a state closure would be stale (a 2nd vote could overwrite the 1st).
  const votesRef = useRef<VotesMap>({});
  const votesLoaded = useRef(false);
  const [pendingVotes, setPendingVotes] = useState<VotesMap>({});
  const addressRef = useRef<string | null>(null);
  addressRef.current = account?.address ?? null;
  const keypairRef = useRef<SerializedKeypair | null>(null);
  keypairRef.current = serializedKeypair;
  const lastCheckedHash = useRef<bigint | null>(null);
  const legacyCandidatesRef = useRef<Promise<LegacyCandidate[]> | null>(null);

  // Drop the cached July-key candidates when the login changes.
  useEffect(() => {
    legacyCandidatesRef.current = null;
  }, [account?.address]);

  /** SignUp stateIndex for a pubkey: explorer first, RPC window scan fallback. */
  const lookupSignUp = useCallback(
    (pubX: bigint, pubY: bigint): Promise<LookupResult> =>
      findSignUpStateIndex(pubX, pubY, {
        explorer: (x, y) =>
          lookupSignUpViaExplorer({
            pubX: x,
            pubY: y,
            maciAddress: maciReadContract.address,
            fromBlock: MACI_DEPLOY_BLOCK,
          }),
        rpcScan: (x, y) => {
          const signUpEvent = prepareEvent({
            signature:
              "event SignUp(uint256 _stateIndex, uint256 indexed _userPubKeyX, uint256 indexed _userPubKeyY, uint256 _voiceCreditBalance, uint256 _timestamp)",
            filters: { _userPubKeyX: x, _userPubKeyY: y },
          });
          return lookupSignUpViaRpcScan({
            fromBlock: MACI_DEPLOY_BLOCK,
            getLatestBlock: () => eth_blockNumber(getRpcClient({ client, chain: gnosisRead })),
            getSignUpInWindow: async (from, to) => {
              const events = await getContractEvents({
                contract: maciReadContract,
                events: [signUpEvent],
                fromBlock: from,
                toBlock: to,
              });
              if (events.length === 0) return null;
              const ev = events[0] as unknown as { args: { _stateIndex?: bigint } };
              return ev.args._stateIndex ?? 0n;
            },
          });
        },
        log: (msg) => console.warn(`[MaciContext] ${msg}`),
      }),
    [],
  );

  /** Re-derive the July (Base-signed) voting key candidates. One wallet
   *  signature; both raw and ERC-6492 variants (see lib/maci-legacy-key.ts). */
  const deriveLegacyKeyCandidates = useCallback(async (): Promise<LegacyCandidate[]> => {
    const { admin, smartAccountAddress } = await connectLegacyBaseSigner({
      client,
      createWallet: getLegacyBaseWallet,
    });
    if (account?.address && smartAccountAddress.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error("legacy Base account address mismatch");
    }
    const signatures = await buildLegacySignatureCandidates({
      client,
      admin,
      smartAccountAddress,
      message: KEY_DERIVATION_MESSAGE,
    });
    return signatures.map((sig) => {
      const keypair = deriveMaciKeypairFromSeed(seedFromSignature(sig));
      return { pubX: BigInt(keypair.pubX), pubY: BigInt(keypair.pubY), keypair };
    });
  }, [account?.address]);

  // Load keypair + votes from secure store on mount, and the keypair again
  // whenever the login changes. The keypair is per account (its SignUp is per
  // MACI core, valid for EVERY poll): the account's own copy wins, else the
  // device slot — the same key is reused for every proposal, never re-derived.
  useEffect(() => {
    let cancelled = false;
    const address = account?.address ?? null;
    setKeypairLoading(true);
    (async () => {
      try {
        const [rawDevice, rawAccount, rawVotes] = await Promise.all([
          SecureStore.getItemAsync(SECURE_KEY),
          address
            ? SecureStore.getItemAsync(maciKeypairAccountKey(address)).catch(() => null)
            : Promise.resolve(null),
          votesLoaded.current ? Promise.resolve(null) : SecureStore.getItemAsync(VOTES_KEY),
        ]);
        if (cancelled) return;
        const chosen = chooseStoredKeypair(rawAccount, rawDevice);
        if (chosen) {
          const next = JSON.parse(chosen.raw) as SerializedKeypair;
          const prev = keypairRef.current;
          if (!prev || prev.pubKey !== next.pubKey || prev.stateIndex !== next.stateIndex) {
            // A different key → its SignUp must be resolved again.
            if (!prev || prev.pubKey !== next.pubKey) setSignUpState({ status: "unknown" });
            keypairRef.current = next;
            setSerializedKeypair(next);
          }
          // Keep the device slot on the active account's key (the passkey
          // resolver reads that slot).
          if (chosen.source === "account" && rawDevice !== chosen.raw) {
            SecureStore.setItemAsync(SECURE_KEY, chosen.raw).catch(() => undefined);
          }
        } else {
          keypairRef.current = null;
          setSerializedKeypair(null);
          setSignUpState({ status: "needs-keypair" });
        }
        if (!votesLoaded.current) {
          votesLoaded.current = true;
          if (rawVotes) {
            try {
              const parsed = JSON.parse(rawVotes) as VotesMap;
              votesRef.current = { ...parsed, ...votesRef.current };
              setVotes(votesRef.current);
            } catch (err) {
              console.warn("[MaciContext] failed to parse votes cache:", err);
            }
          }
        }
      } catch (err) {
        console.warn("[MaciContext] failed to load keypair:", err);
        if (!keypairRef.current) setSignUpState({ status: "needs-keypair" });
      } finally {
        if (!cancelled) setKeypairLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  /** Copy a keypair into the active account's own slot (best effort). */
  const mirrorToAccount = useCallback((kp: SerializedKeypair) => {
    const address = addressRef.current;
    if (!address) return;
    SecureStore.setItemAsync(maciKeypairAccountKey(address), JSON.stringify(kp)).catch((err) =>
      console.warn("[MaciContext] per-account key copy failed:", err),
    );
  }, []);

  /** Persist a keypair update + return the new serialized form. */
  const persistKeypair = useCallback(async (next: SerializedKeypair) => {
    await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(next));
    mirrorToAccount(next);
    setSerializedKeypair(next);
    return next;
  }, [mirrorToAccount]);

  const refreshSignUp = useCallback(async (opts?: RefreshSignUpOptions): Promise<SignUpState> => {
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
      mirrorToAccount(serializedKeypair);
      console.log("[MaciContext] refreshSignUp: cache hit", { stateIndex: stateIndex.toString() });
      return s;
    }

    // Layer 2 — on-chain lookup. MACI v2 has no getStateIndex(pubKeyHash)
    // view, so we look for this pubkey's SignUp log (the gatekeeper enforces
    // one SignUp per token). One explorer request first; the RPC window scan
    // (MACI_DEPLOY_BLOCK → latest, ~180 windows by now) only as a fallback.
    // CRITICAL: a failed lookup is `unknown` (retryable), never needs-signup.
    //
    // Layer 3 — July-key recovery. If this key has no SignUp but the citizen's
    // token is already registered (or signUp just reverted AlreadyRegistered),
    // the citizen signed up in July with the Base-derived key and lost it
    // since. Re-derive that key (lib/maci-legacy-key.ts) and adopt it if it has
    // a SignUp. Otherwise report `legacyKeyLost` (no endless retry).
    const outcome = await resolveSignUpWithRecovery<LegacyCandidate>({
      current: { pubX, pubY },
      lookup: lookupSignUp,
      alreadyRegistered: opts?.alreadyRegistered,
      isTokenRegistered: async () => {
        if (!account?.address) return null;
        let tokenId: bigint;
        try {
          tokenId = (await readContract({
            contract: citizenNFTContract,
            method: "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
            params: [account.address, 0n],
          })) as bigint;
        } catch {
          return null; // no CitizenNFT → a plain needs-signup
        }
        return (await readContract({
          contract: maciGatekeeperReadContract,
          method: "function registeredTokenIds(uint256) view returns (bool)",
          params: [tokenId],
        })) as boolean;
      },
      deriveLegacyCandidates: () => {
        if (!legacyCandidatesRef.current) {
          legacyCandidatesRef.current = deriveLegacyKeyCandidates().catch((err) => {
            legacyCandidatesRef.current = null; // allow a retry after a transient failure
            throw err;
          });
        }
        return legacyCandidatesRef.current;
      },
    });

    if (outcome.kind === "current" || outcome.kind === "legacy") {
      const stateIndex = outcome.stateIndex;
      const keypair = outcome.kind === "legacy" ? outcome.key.keypair : serializedKeypair;
      const hash =
        outcome.kind === "legacy"
          ? (deserializeKeypair(keypair).pubKey.hash() as bigint)
          : pubKeyHash;
      await persistKeypair({
        ...keypair,
        stateIndex: stateIndex.toString(),
        pubKeyHash: hash.toString(),
      });
      lastCheckedHash.current = hash;
      const s: SignUpState = { status: "signed-up", pubKeyHash: hash, stateIndex };
      setSignUpState(s);
      console.log(`[MaciContext] refreshSignUp: signed-up (${outcome.kind} key)`, {
        stateIndex: stateIndex.toString(),
      });
      return s;
    }
    if (outcome.kind === "unknown") {
      console.warn(`[MaciContext] refreshSignUp: lookup incomplete (${outcome.reason})`);
      const s: SignUpState = { status: "unknown" };
      setSignUpState(s);
      return s;
    }
    const s: SignUpState =
      outcome.kind === "lost-key"
        ? { status: "needs-signup", pubKeyHash, legacyKeyLost: true }
        : { status: "needs-signup", pubKeyHash };
    setSignUpState(s);
    console.log(`[MaciContext] refreshSignUp: ${outcome.kind} → needs-signup`);
    return s;
  }, [serializedKeypair, persistKeypair, mirrorToAccount, account?.address, lookupSignUp, deriveLegacyKeyCandidates]);

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
    const derivedHash = deserializeKeypair(derived).pubKey.hash() as bigint;

    // The derived key is the account's one key: if it already has a SignUp on
    // the MACI core (another device, a reinstall), adopt it right away so the
    // vote sheet skips the signup step instead of offering a signUp tx.
    const lookup = await lookupSignUp(BigInt(derived.pubX), BigInt(derived.pubY)).catch(
      (err): { kind: "error"; reason: string } => ({ kind: "error", reason: String(err) }),
    );
    if (lookup.kind === "found") {
      const persisted = await persistKeypair({
        ...derived,
        stateIndex: lookup.stateIndex.toString(),
        pubKeyHash: derivedHash.toString(),
      });
      lastCheckedHash.current = derivedHash;
      setSignUpState({ status: "signed-up", pubKeyHash: derivedHash, stateIndex: lookup.stateIndex });
      return persisted;
    }
    const persisted = await persistKeypair(derived);
    setSignUpState(
      lookup.kind === "not-found" ? { status: "needs-signup", pubKeyHash: derivedHash } : { status: "unknown" },
    );
    return persisted;
  }, [account, serializedKeypair, persistKeypair, lookupSignUp]);

  const clearKeypair = useCallback(async () => {
    await SecureStore.deleteItemAsync(SECURE_KEY);
    await SecureStore.deleteItemAsync(VOTES_KEY);
    const address = addressRef.current;
    if (address) await SecureStore.deleteItemAsync(maciKeypairAccountKey(address)).catch(() => undefined);
    setSerializedKeypair(null);
    setSignUpState({ status: "needs-keypair" });
    votesRef.current = {};
    setVotes({});
    setPendingVotes({});
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
        ...votesRef.current,
        [key]: {
          pollAddress: key,
          optionIndex,
          nonce: nonce.toString(),
          txHash,
          votedAt: Math.floor(Date.now() / 1000),
        },
      };
      votesRef.current = next;
      setVotes(next);
      setPendingVotes((prev) => {
        if (!prev[key]) return prev;
        const { [key]: _drop, ...rest } = prev;
        return rest;
      });
      try {
        await SecureStore.setItemAsync(VOTES_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn("[MaciContext] failed to persist vote record:", err);
      }
    },
    [],
  );

  const markVotePending = useCallback((pollAddress: string, optionIndex: number) => {
    const key = pollAddress.toLowerCase();
    setPendingVotes((prev) => ({
      ...prev,
      [key]: { pollAddress: key, optionIndex, nonce: "", txHash: "", votedAt: Math.floor(Date.now() / 1000) },
    }));
  }, []);

  const clearVotePending = useCallback((pollAddress: string) => {
    const key = pollAddress.toLowerCase();
    setPendingVotes((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const getLastVote = useCallback(
    (pollAddress: string): VoteRecord | null => {
      const key = pollAddress.toLowerCase();
      return pickLastVote(votes[key], pendingVotes[key]);
    },
    [votes, pendingVotes],
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
      markVotePending,
      clearVotePending,
      getNextNonce,
    }),
    [serializedKeypair, keypairLoading, signUpState, generateAndStoreKeypair, clearKeypair, refreshSignUp, markSignedUp, getKeypair, recordVote, getLastVote, markVotePending, clearVotePending, getNextNonce],
  );

  return <MaciContext.Provider value={value}>{children}</MaciContext.Provider>;
}

export function useMaci(): MaciContextShape {
  const ctx = useContext(MaciContext);
  if (!ctx) throw new Error("useMaci must be used inside <MaciProvider>");
  return ctx;
}
