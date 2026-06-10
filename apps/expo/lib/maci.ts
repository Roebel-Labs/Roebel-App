/**
 * MACI v2 client for the Roebel/Müritz Expo app.
 *
 * Wraps `maci-domainobjs` + `maci-crypto` for the three operations the citizen
 * UI needs:
 *
 *   1. generateMaciKeypair() / serializeKeypair() / deserializeKeypair()
 *      — fresh BabyJubjub keypair, persisted in expo-secure-store as serialized
 *        macipk./macisk. strings.
 *
 *   2. prepareSignUpData(tokenId)
 *      — builds the abi-encoded `(uint256 tokenId, "")` blobs required by
 *        `MACI.signUp(pubKey, signUpGatekeeperData, initialVoiceCreditProxyData)`
 *        when MACI's gatekeeper is the stock SignUpTokenGatekeeper bound to
 *        CitizenNFT.
 *
 *   3. buildVoteMessage({ ... })
 *      — encrypts a vote command (Yes/No/Abstain + nonce + weight) to the
 *        coordinator's public key with ECDH + Poseidon, returning the
 *        `(uint256[10] message, PubKey encPubKey)` tuple expected by
 *        `Poll.publishMessage(...)`.
 *
 * RN compat: this module relies on `react-native-quick-crypto` (mapped from
 * `crypto` in metro.config.js) and `react-native-get-random-values` (imported
 * once in index.js). Don't import from this module before those polyfills run.
 */
import {
  Keypair,
  PrivKey,
  PubKey,
  Message,
  PCommand,
} from "maci-domainobjs";
import { genRandomSalt, SNARK_FIELD_SIZE } from "maci-crypto";
import { encodeAbiParameters } from "thirdweb/utils";

// NOTE: there is deliberately NO hardcoded coordinator pubkey here anymore.
//
// A previous constant (MACI_COORDINATOR_PUBKEY) silently invalidated every
// ballot on polls 3 + 4: after the 2026-06-09 Shamir key rotation, new polls
// were deployed with the NEW coordinator pubkey, but the app kept ECDH-
// encrypting votes to the OLD hardcoded key. The MACI Process circuit
// discards messages it can't decrypt as no-ops — so the tallies landed
// "successfully" with zero valid votes and no error anywhere.
//
// The coordinator pubkey MUST be read from the Poll contract at vote time
// (each Poll stores the key it was deployed with — see
// VoteButtons.handleVote). That is correct across every past and future
// rotation, with nothing to remember to bump.

// -------------------------- Keypair helpers --------------------------

export interface SerializedKeypair {
  privKey: string; // macisk.<hex>
  pubKey: string; // macipk.<hex>
  pubX: string; // decimal big-int as string
  pubY: string;
  /** Filled in after a successful MACI.signUp tx — the stateIndex MACI
   *  assigned to this pubKey. Persisting locally bypasses both the chain
   *  read on every cold-start and MACI v2's lack of a getStateIndex view. */
  stateIndex?: string;
  /** Cached Poseidon hash of the pubkey so we don't recompute it on every
   *  refresh. */
  pubKeyHash?: string;
}

export function generateMaciKeypair(): SerializedKeypair {
  const kp = new Keypair();
  return serializeKeypair(kp);
}

/**
 * Derive a *deterministic* MACI keypair from a seed (e.g. keccak256 of a wallet
 * signature). The same wallet → same seed → same keypair on every device, so a
 * reinstall, EAS rebuild, or new device re-derives the identical voting key
 * instead of minting a fresh (unregistered) one — which is what previously left
 * citizens stuck on "bereits angemeldet" with no vote buttons.
 *
 * The seed is reduced into the BabyJubjub scalar field; PrivKey then formats it
 * for the curve when signing/encrypting.
 */
export function deriveMaciKeypairFromSeed(seed: bigint): SerializedKeypair {
  const priv = ((seed % SNARK_FIELD_SIZE) + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE;
  const kp = new Keypair(new PrivKey(priv));
  return serializeKeypair(kp);
}

export function serializeKeypair(kp: Keypair): SerializedKeypair {
  const { x, y } = kp.pubKey.asContractParam() as { x: string; y: string };
  return {
    privKey: kp.privKey.serialize(),
    pubKey: kp.pubKey.serialize(),
    pubX: x.toString(),
    pubY: y.toString(),
  };
}

export function deserializeKeypair(serialized: SerializedKeypair): Keypair {
  return new Keypair(PrivKey.deserialize(serialized.privKey));
}

// -------------------------- Signup data --------------------------

/** ABI-encode the tokenId payload that SignUpTokenGatekeeper expects. */
export function prepareSignUpGatekeeperData(tokenId: bigint): `0x${string}` {
  return encodeAbiParameters([{ type: "uint256" }], [tokenId]);
}

/** ABI-encode the (empty) payload ConstantInitialVoiceCreditProxy expects. */
export function prepareInitialVoiceCreditProxyData(): `0x${string}` {
  // The constant proxy ignores its data argument, but MACI insists on a non-
  // null bytes value. An empty bytes is canonical.
  return "0x";
}

// -------------------------- Vote message --------------------------

export interface BuildVoteMessageArgs {
  /** Voter's MACI keypair (from secure storage). */
  voterKeypair: Keypair;
  /** State index returned by MACI when the voter signed up. */
  voterStateIndex: bigint;
  /** MACI poll id this vote is for. */
  pollId: bigint;
  /** Vote option index (0 = Against, 1 = For, 2 = Abstain). */
  voteOptionIndex: bigint;
  /** Voice credits to spend on this option (1 in non-QV mode). */
  voiceCredits: bigint;
  /** Monotonically-increasing nonce per voter per poll. Start at 1, +1 for each re-vote. */
  nonce: bigint;
  /** Optional: rotate the voter's keypair while voting (useful for vote-changing). Defaults to existing key. */
  newPubKey?: PubKey;
  /**
   * Coordinator's MACI pubkey — REQUIRED, and it must come from the Poll
   * contract's own coordinatorPubKey() read, never from a constant. A poll
   * is permanently bound to the key it was deployed with; encrypting to
   * anything else silently voids the ballot (see note at the top of this
   * file).
   */
  coordinatorPubKey: PubKey;
}

export interface VoteMessagePayload {
  /** uint256[10] -- pass straight to Poll.publishMessage's first argument. */
  message: bigint[];
  /** Ephemeral encryption pubkey -- pass as the second argument. */
  encPubKey: { x: bigint; y: bigint };
}

/**
 * Build an encrypted vote message ready to be sent to `Poll.publishMessage`.
 * The vote is encrypted with ECDH between a fresh ephemeral keypair and the
 * coordinator's public key; only the coordinator (or a quorum of attesters
 * holding shares of the coordinator key) can decrypt it.
 */
export function buildVoteMessage(args: BuildVoteMessageArgs): VoteMessagePayload {
  const coordinatorPub = args.coordinatorPubKey;
  const newPub = args.newPubKey ?? args.voterKeypair.pubKey;

  // Build the vote command. PCommand is the v2 "private command" used for
  // standard non-key-rotation votes. New pubkey defaults to the existing one
  // (i.e., no key rotation), but voters may rotate by passing newPubKey.
  const command = new PCommand(
    args.voterStateIndex,
    newPub,
    args.voteOptionIndex,
    args.voiceCredits,
    args.nonce,
    args.pollId,
    genRandomSalt(),
  );

  // Sign the command with the voter's privkey. The MACI Process circuit
  // verifies this signature at tally time.
  const signature = command.sign(args.voterKeypair.privKey);

  // Generate a fresh ephemeral keypair for this message. ECDH with the
  // coordinator pubkey yields the shared key used to encrypt.
  const ephemeral = new Keypair();
  const sharedKey = Keypair.genEcdhSharedKey(ephemeral.privKey, coordinatorPub);
  const encrypted = command.encrypt(signature, sharedKey);

  // `encrypted` is a Message instance; .data is uint256[10].
  const messageData = encrypted.data.map((v: bigint | string) => BigInt(v));
  const { x, y } = ephemeral.pubKey.asContractParam() as { x: string; y: string };

  return {
    message: messageData,
    encPubKey: { x: BigInt(x), y: BigInt(y) },
  };
}

// -------------------------- Re-exports --------------------------

export { Keypair, PrivKey, PubKey, Message, PCommand };
