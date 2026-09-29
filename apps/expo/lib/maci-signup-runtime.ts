/**
 * Real-world wiring of the MACI SignUp lookup, the gatekeeper read and the July-key derivation,
 * shared by MaciContext (thirdweb + passkey sessions) and the passkey "Schlüssel sichern"
 * (lib/passkey/key-completion-runtime.ts). The decisions live in pure modules:
 * lib/maci-signup-lookup.ts, lib/maci-legacy-key.ts, lib/passkey/maci-key-resolver.ts.
 *
 * thirdweb wallets here are only ever autoConnect()ed or asked to sign — never passed to
 * setActiveWallet, so the active wallet (thirdweb or passkey adapter) stays as it is.
 */
import { getContract, getContractEvents, prepareEvent, readContract } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { getRpcClient, eth_blockNumber } from 'thirdweb/rpc';
import { inAppWallet } from 'thirdweb/wallets/in-app';
import { citizenNFTContract, client, MACI_DEPLOY_BLOCK, maciReadContract } from '@/constants/thirdweb';
import { gnosisRead } from '@/constants/gnosis';
import { redirectUrl } from '@/constants/wallets';
import {
  findSignUpStateIndex,
  lookupSignUpViaExplorer,
  lookupSignUpViaRpcScan,
  type LookupResult,
} from '@/lib/maci-signup-lookup';
import { buildLegacySignatureCandidates, connectLegacyBaseSigner, seedFromSignature } from '@/lib/maci-legacy-key';
import { deriveMaciKeypairFromSeed, type SerializedKeypair } from '@/lib/maci';
import { deriveMaciKeypairFromWalletSignature, MACI_KEY_DERIVATION_MESSAGE } from '@/lib/maci-key-derivation';
import type { MaciThirdwebSource } from '@/lib/passkey/maci-key-resolver';

// SignUpTokenGatekeeper (→CitizenNFTv2) — read-only, for registeredTokenIds.
const MACI_GATEKEEPER_ADDRESS = process.env.EXPO_PUBLIC_MACI_GATEKEEPER || '0xc4B9E45F0e84BC0CDe930CE888E4D0e38184f277';
const maciGatekeeperReadContract = getContract({ client, address: MACI_GATEKEEPER_ADDRESS, chain: gnosisRead });

/** SignUp stateIndex for a pubkey: explorer first, RPC window scan fallback. */
export function lookupMaciSignUp(pubX: bigint, pubY: bigint): Promise<LookupResult> {
  return findSignUpStateIndex(pubX, pubY, {
    explorer: (x, y) =>
      lookupSignUpViaExplorer({ pubX: x, pubY: y, maciAddress: maciReadContract.address, fromBlock: MACI_DEPLOY_BLOCK }),
    rpcScan: (x, y) => {
      const signUpEvent = prepareEvent({
        signature:
          'event SignUp(uint256 _stateIndex, uint256 indexed _userPubKeyX, uint256 indexed _userPubKeyY, uint256 _voiceCreditBalance, uint256 _timestamp)',
        filters: { _userPubKeyX: x, _userPubKeyY: y },
      });
      return lookupSignUpViaRpcScan({
        fromBlock: MACI_DEPLOY_BLOCK,
        getLatestBlock: () => eth_blockNumber(getRpcClient({ client, chain: gnosisRead })),
        getSignUpInWindow: async (from, to) => {
          const events = await getContractEvents({ contract: maciReadContract, events: [signUpEvent], fromBlock: from, toBlock: to });
          if (events.length === 0) return null;
          const ev = events[0] as unknown as { args: { _stateIndex?: bigint } };
          return ev.args._stateIndex ?? 0n;
        },
      });
    },
    log: (msg) => console.warn(`[maci-signup] ${msg}`),
  });
}

/**
 * Is `owner`'s CitizenNFTv2 token already registered at the gatekeeper?
 * null = no CitizenNFT (a plain needs-signup); a failed gatekeeper read THROWS (unknown).
 */
export async function isCitizenTokenRegistered(owner: string): Promise<boolean | null> {
  let tokenId: bigint;
  try {
    tokenId = (await readContract({
      contract: citizenNFTContract,
      method: 'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
      params: [owner, 0n],
    })) as bigint;
  } catch {
    return null;
  }
  return (await readContract({
    contract: maciGatekeeperReadContract,
    method: 'function registeredTokenIds(uint256) view returns (bool)',
    params: [tokenId],
  })) as boolean;
}

/** Separate in-app wallet on BASE with the same auth options as constants/wallets.ts. Only ever
 *  autoConnect()ed (reuses the stored login) and NEVER made active — used solely for the July key. */
let legacyBaseWallet: ReturnType<typeof inAppWallet> | null = null;
function getLegacyBaseWallet() {
  if (!legacyBaseWallet) {
    legacyBaseWallet = inAppWallet({
      auth: { options: ['email', 'google', 'facebook', 'apple'], redirectUrl },
      smartAccount: { chain: base, sponsorGas: true },
    });
  }
  return legacyBaseWallet;
}

/**
 * The July (Base-signed) voting key candidates: ONE admin signature, raw + ERC-6492 variants.
 * `expectedAddress`: the thirdweb smart account that must match (null = skip the check).
 */
export async function deriveLegacyMaciKeypairs(expectedAddress: string | null): Promise<SerializedKeypair[]> {
  const { admin, smartAccountAddress } = await connectLegacyBaseSigner({ client, createWallet: getLegacyBaseWallet });
  if (expectedAddress && smartAccountAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('legacy Base account address mismatch');
  }
  const signatures = await buildLegacySignatureCandidates({
    client,
    admin,
    smartAccountAddress,
    message: MACI_KEY_DERIVATION_MESSAGE,
  });
  return signatures.map((sig) => deriveMaciKeypairFromSeed(seedFromSignature(sig)));
}

/** A thirdweb (Gnosis) account as a MACI key source: today's key + the July Base keys. */
export function thirdwebMaciSource(account: {
  address: string;
  signMessage: (args: { message: string }) => Promise<string>;
}): MaciThirdwebSource {
  return {
    address: account.address,
    deriveGnosis: () => deriveMaciKeypairFromWalletSignature(account),
    deriveLegacy: () => deriveLegacyMaciKeypairs(account.address),
  };
}
