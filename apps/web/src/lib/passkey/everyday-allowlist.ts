/**
 * "Everyday" citizen actions a passkey Safe may have sponsored (sponsor mode
 * `everyday`): exactly the Röbel contract writes the apps make from a
 * citizen's account on Gnosis, and nothing else. Pure and structural: the only
 * chain fact it needs (a MACI Poll's address) is returned as a claim for the
 * policy to verify.
 *
 * Every call must carry value 0. Identity = the account the call runs as:
 * the legacy thirdweb account (wrapped in legacy.execute/executeBatch) or the
 * passkey Safe itself (direct call). Argument rules pin Münzen to the Röbel
 * group and transfers to the identity's own balance.
 *
 * Tiers:
 *  - `citizen`: the identity must hold a CitizenNFT (checked by the policy).
 *  - `onboarding`: allowed for a NON-citizen passkey Safe (a brand-new user),
 *    under a tighter per-identity budget. Only CitizenNFTv2.createAttestationRequest
 *    (asking the attesters to verify you). Circles registerHuman is citizen-tier:
 *    Röbel only invites citizens, and the Hub itself requires an inviter's trust.
 *
 * Addresses: packages/blockchain/src/index.ts (CONTRACTS) + apps/expo/constants/gnosis.ts
 * (Hub, group, NameRegistry). Selectors checked against deployed bytecode on
 * Gnosis 2026-09-27 (every selector below is present in its target's code).
 *
 * Deliberately NOT allowlisted (documented in docs/PASSKEY_SIGNIN_NOTES.md):
 *  - native xDAI sends and mini-app eth_sendTransaction (open-ended target/value);
 *  - MaciAttesterGovernor propose/proposeWithPeriod/queue/execute (a poll deploy
 *    costs ~15.7M gas, far over the sponsor gas caps; the web sends it self-paid);
 *  - CitizenNFT safeMint (old mint page), Deliberate (dormant), Base-chain writes;
 *  - Poll.publishMessageBatch (the apps never send it).
 */
import { decodeFunctionData, isAddressEqual, parseAbi, size, sliceHex, type Hex } from "viem";

export const EVERYDAY_CONTRACTS = {
  circlesHub: "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8",
  /** Röbel Münzen group (Circles v2 BaseGroup); its ERC1155 id is uint256(address). */
  roebelGroup: "0xAc2CeCdBead594F97358a0d3132454f24F3E470c",
  circlesNameRegistry: "0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474",
  citizenNft: "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5",
  attesterNft: "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82",
  maci: "0x6663eDC8650276fe264710B1A2ba46eB8bd0bF1D",
} as const satisfies Record<string, Hex>;

export const hubAbi = parseAbi([
  "function personalMint()",
  "function registerHuman(address inviter, bytes32 metadataDigest)",
  "function groupMint(address group, address[] collateralAvatars, uint256[] amounts, bytes data)",
  "function trust(address trustReceiver, uint96 expiry)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
]);
export const nameRegistryAbi = parseAbi(["function updateMetadataDigest(bytes32 metadataDigest)"]);
export const citizenNftAbi = parseAbi([
  "function createAttestationRequest(string info)",
  "function createRevocationRequest(address account, string reason)",
  "function approveRequest(uint256 requestId, bool asAttester)",
  "function rejectRequest(uint256 requestId, bool asAttester)",
]);
export const attesterNftAbi = parseAbi([
  "function createAttestationRequest(string info)",
  "function createRevocationRequest(address account, string reason)",
  "function approveRequest(uint256 requestId)",
  "function rejectRequest(uint256 requestId)",
]);
export const maciAbi = parseAbi(["function signUp((uint256 x, uint256 y) pubKey, bytes gatekeeperData, bytes voiceCreditData)"]);
export const pollAbi = parseAbi([
  "function publishMessage((uint256[10] data) message, (uint256 x, uint256 y) encPubKey)",
]);

/** Selector table (for docs and the notes file). */
export const EVERYDAY_SELECTORS = {
  "Hub.personalMint()": "0x0d873a79",
  "Hub.groupMint(address,address[],uint256[],bytes)": "0x6cb498e5",
  "Hub.registerHuman(address,bytes32)": "0xe76cec53",
  "Hub.trust(address,uint96)": "0x75dcebc7",
  "Hub.safeTransferFrom(address,address,uint256,uint256,bytes)": "0xf242432a",
  "NameRegistry.updateMetadataDigest(bytes32)": "0x3857d9d7",
  "CitizenNFTv2.createAttestationRequest(string)": "0xda5f81d7",
  "CitizenNFTv2.createRevocationRequest(address,string)": "0xdfa59e4a",
  "CitizenNFTv2.approveRequest(uint256,bool)": "0x767e0b9c",
  "CitizenNFTv2.rejectRequest(uint256,bool)": "0x1effb912",
  "AttesterNFTv2.createAttestationRequest(string)": "0xda5f81d7",
  "AttesterNFTv2.createRevocationRequest(address,string)": "0xdfa59e4a",
  "AttesterNFTv2.approveRequest(uint256)": "0xd7d1bbdb",
  "AttesterNFTv2.rejectRequest(uint256)": "0x2d7788db",
  "MACI.signUp((uint256,uint256),bytes,bytes)": "0x3364120a",
  "Poll.publishMessage((uint256[10]),(uint256,uint256))": "0x27bea0da",
} as const;

export const PUBLISH_MESSAGE_SELECTOR: Hex = "0x27bea0da";

export type EverydayTier = "citizen" | "onboarding";
export type EverydayVerdict =
  | { ok: true; tier: EverydayTier; label: string; /** set for Poll.publishMessage: the target to verify against MACI.polls(pollId) */ poll?: Hex }
  | { ok: false; reason: string };

const no = (reason: string): EverydayVerdict => ({ ok: false, reason });
const yes = (label: string, tier: EverydayTier = "citizen"): EverydayVerdict => ({ ok: true, tier, label });

function decode<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** True when `to` is one of the static everyday targets (the Poll is dynamic and not in this set). */
export function isEverydayStaticTarget(to: Hex): boolean {
  return Object.values(EVERYDAY_CONTRACTS).some((a) => a !== EVERYDAY_CONTRACTS.roebelGroup && isAddressEqual(a, to));
}

/** A call that looks like a MACI Poll vote (dynamic target; the policy must verify the address). */
export function looksLikePollVote(data: Hex): boolean {
  return size(data) >= 4 && sliceHex(data, 0, 4).toLowerCase() === PUBLISH_MESSAGE_SELECTOR;
}

/**
 * Classifies one call `identity` would make (msg.sender on the target is `identity`).
 * Returns the tier it needs, or why it is not an everyday action.
 */
export function classifyEverydayCall(to: Hex, value: bigint, data: Hex, identity: Hex): EverydayVerdict {
  if (size(data) < 4) return no("everyday call without a function selector");
  if (value !== 0n) return no("everyday calls must carry value 0");
  const C = EVERYDAY_CONTRACTS;

  if (isAddressEqual(to, C.circlesHub)) {
    const d = decode(() => decodeFunctionData({ abi: hubAbi, data }));
    if (!d) return no("Circles Hub function not allowlisted");
    switch (d.functionName) {
      case "personalMint":
        return yes("Hub.personalMint");
      case "groupMint":
        if (!isAddressEqual(d.args[0], C.roebelGroup)) return no("groupMint only into the Röbel group");
        return yes("Hub.groupMint");
      case "trust":
        return yes("Hub.trust");
      case "registerHuman":
        return yes("Hub.registerHuman");
      case "safeTransferFrom": {
        const [from, , id] = d.args;
        if (!isAddressEqual(from, identity)) return no("safeTransferFrom must spend the identity's own balance");
        if (id !== BigInt(C.roebelGroup)) return no("safeTransferFrom only of Röbel Münzen (id = the Röbel group)");
        return yes("Hub.safeTransferFrom");
      }
    }
  }

  if (isAddressEqual(to, C.circlesNameRegistry)) {
    const d = decode(() => decodeFunctionData({ abi: nameRegistryAbi, data }));
    if (!d) return no("Circles NameRegistry function not allowlisted");
    return yes("NameRegistry.updateMetadataDigest");
  }

  if (isAddressEqual(to, C.citizenNft)) {
    const d = decode(() => decodeFunctionData({ abi: citizenNftAbi, data }));
    if (!d) return no("CitizenNFTv2 function not allowlisted");
    if (d.functionName === "createAttestationRequest") return yes("CitizenNFTv2.createAttestationRequest", "onboarding");
    return yes(`CitizenNFTv2.${d.functionName}`);
  }

  if (isAddressEqual(to, C.attesterNft)) {
    const d = decode(() => decodeFunctionData({ abi: attesterNftAbi, data }));
    if (!d) return no("AttesterNFTv2 function not allowlisted");
    return yes(`AttesterNFTv2.${d.functionName}`);
  }

  if (isAddressEqual(to, C.maci)) {
    const d = decode(() => decodeFunctionData({ abi: maciAbi, data }));
    if (!d) return no("MACI function not allowlisted");
    return yes("MACI.signUp");
  }

  if (looksLikePollVote(data)) {
    const d = decode(() => decodeFunctionData({ abi: pollAbi, data }));
    if (!d) return no("malformed Poll.publishMessage");
    return { ok: true, tier: "citizen", label: "Poll.publishMessage", poll: to };
  }

  return no("call target/selector not allowlisted");
}
