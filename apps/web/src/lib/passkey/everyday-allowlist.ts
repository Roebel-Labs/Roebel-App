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
import {
  concatHex,
  decodeFunctionData,
  encodeAbiParameters,
  getContractAddress,
  hexToBigInt,
  isAddressEqual,
  keccak256,
  numberToHex,
  parseAbi,
  size,
  sliceHex,
  zeroAddress,
  type Hex,
} from "viem";
import { PASSKEY_SAFE, SAFE_PROXY_CREATION_CODE } from "./safe-address";

export const EVERYDAY_CONTRACTS = {
  circlesHub: "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8",
  /** Röbel Münzen group (Circles v2 BaseGroup); its ERC1155 id is uint256(address). */
  roebelGroup: "0xAc2CeCdBead594F97358a0d3132454f24F3E470c",
  circlesNameRegistry: "0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474",
  citizenNft: "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5",
  attesterNft: "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82",
  maci: "0x6663eDC8650276fe264710B1A2ba46eB8bd0bF1D",
  /** NSP-14 OrgRegistry (production, 2026-09-27). */
  orgRegistry: "0x320b4ea2f4E31b81245e684D08AF593DE05E9919",
} as const satisfies Record<string, Hex>;

/**
 * NSP-14 org Safes ("Onchain-Organisation" in the Expo org settings). Plain Safe
 * 1.4.1 accounts owned by the org's owners; every Safe transaction is executed by
 * ONE owner (the identity) with a pre-validated v=1 signature. See
 * docs/superpowers/specs/2026-09-26-org-safe-identity-design.md.
 */
export const ORG_SAFE = {
  proxyFactory: PASSKEY_SAFE.proxyFactory,
  singletonL2: PASSKEY_SAFE.singletonL2,
  /** CompatibilityFallbackHandler 1.4.1 */
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
  multiSendCallOnly: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
  maxOwners: 20,
} as const;

export const orgSafeFactoryAbi = parseAbi([
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce)",
]);
export const orgSafeAbi = parseAbi([
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)",
  "function addOwnerWithThreshold(address owner, uint256 _threshold)",
  "function removeOwner(address prevOwner, address owner, uint256 _threshold)",
  "function changeThreshold(uint256 _threshold)",
]);
export const orgMultiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);
/** What an org Safe may do in the registry (all writes are onlyOrgSafe or open to the Safe). */
export const orgRegistrySafeAbi = parseAbi([
  "function requestRegistration(bytes32 orgId, string metadataURI)",
  "function withdrawRequest(uint256 requestId)",
  "function setRole(bytes32 orgId, address account, uint8 role)",
  "function setNostrKey(bytes32 orgId, bytes32 pubkey, bool authorized)",
  "function setMetadataURI(bytes32 orgId, string metadataURI)",
  "function proposeRotation(bytes32 orgId, address next)",
  "function acceptRotation(bytes32 orgId)",
]);
/** What a citizen (attester) may call on the registry directly. */
export const orgRegistryAttesterAbi = parseAbi([
  "function approveRequest(uint256 requestId)",
  "function rejectRequest(uint256 requestId)",
  "function requestRevocation(bytes32 orgId, string evidenceURI)",
  "function expireRequest(uint256 requestId)",
  "function closeStale(uint256 requestId)",
]);
export const EXEC_TRANSACTION_SELECTOR: Hex = "0x6a761202";

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
  "SafeProxyFactory.createProxyWithNonce(address,bytes,uint256) [org Safe]": "0x1688f0b9",
  "Safe.execTransaction(...) [org Safe, pre-validated by the identity]": "0x6a761202",
  "OrgRegistry.approveRequest(uint256)": "0xd7d1bbdb",
  "OrgRegistry.rejectRequest(uint256)": "0x2d7788db",
} as const;

export const PUBLISH_MESSAGE_SELECTOR: Hex = "0x27bea0da";

export type EverydayTier = "citizen" | "onboarding";
export type EverydayVerdict =
  | {
      ok: true;
      tier: EverydayTier;
      label: string;
      /** set for Poll.publishMessage: the target to verify against MACI.polls(pollId) */
      poll?: Hex;
      /** set for an org-Safe execTransaction: must be a Safe L2 1.4.1 proxy, or created earlier in the batch */
      orgSafe?: Hex;
      /** set for an org-Safe deployment: the CREATE2 address this call creates */
      createdSafe?: Hex;
    }
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

  if (isAddressEqual(to, ORG_SAFE.proxyFactory)) return classifyOrgSafeDeploy(data, identity);

  if (isAddressEqual(to, C.orgRegistry)) {
    const d = decode(() => decodeFunctionData({ abi: orgRegistryAttesterAbi, data }));
    if (!d) return no("OrgRegistry function not allowlisted for direct calls");
    return yes(`OrgRegistry.${d.functionName}`);
  }

  if (sliceHex(data, 0, 4).toLowerCase() === EXEC_TRANSACTION_SELECTOR) return classifyOrgSafeExec(to, data, identity);

  if (looksLikePollVote(data)) {
    const d = decode(() => decodeFunctionData({ abi: pollAbi, data }));
    if (!d) return no("malformed Poll.publishMessage");
    return { ok: true, tier: "citizen", label: "Poll.publishMessage", poll: to };
  }

  return no("call target/selector not allowlisted");
}

// ---------------------------------------------------------------------------
// NSP-14 org Safes
// ---------------------------------------------------------------------------

/** A plain org Safe: Safe L2 1.4.1, the identity among its owners, no modules, no payment. */
function classifyOrgSafeDeploy(data: Hex, identity: Hex): EverydayVerdict {
  const d = decode(() => decodeFunctionData({ abi: orgSafeFactoryAbi, data }));
  if (!d) return no("SafeProxyFactory function not allowlisted");
  const [singleton, initializer, saltNonce] = d.args;
  if (!isAddressEqual(singleton, ORG_SAFE.singletonL2)) return no("org Safe singleton must be Safe L2 1.4.1");
  const setup = decode(() => decodeFunctionData({ abi: orgSafeAbi, data: initializer }));
  if (!setup || setup.functionName !== "setup") return no("org Safe initializer must be a plain Safe.setup");
  const [owners, threshold, delegateTo, delegateData, handler, paymentToken, payment, receiver] = setup.args;
  if (owners.length === 0 || owners.length > ORG_SAFE.maxOwners) return no("org Safe owner count out of range");
  if (!owners.some((o) => isAddressEqual(o, identity))) return no("the identity must be an owner of the org Safe it deploys");
  if (threshold < 1n || threshold > BigInt(owners.length)) return no("org Safe threshold out of range");
  if (!isAddressEqual(delegateTo, zeroAddress) || delegateData !== "0x") return no("org Safe setup must not delegatecall (no modules)");
  if (!isAddressEqual(handler, ORG_SAFE.fallbackHandler)) return no("org Safe fallback handler must be CompatibilityFallbackHandler 1.4.1");
  if (!isAddressEqual(paymentToken, zeroAddress) || payment !== 0n || !isAddressEqual(receiver, zeroAddress)) {
    return no("org Safe setup must not pay anyone");
  }
  const salt = keccak256(concatHex([keccak256(initializer), numberToHex(saltNonce, { size: 32 })]));
  const bytecode = concatHex([SAFE_PROXY_CREATION_CODE, encodeAbiParameters([{ type: "address" }], [ORG_SAFE.singletonL2])]);
  const createdSafe = getContractAddress({ opcode: "CREATE2", from: ORG_SAFE.proxyFactory, salt, bytecode });
  return { ok: true, tier: "citizen", label: "SafeProxyFactory.createProxyWithNonce (org Safe)", createdSafe };
}

/** One inner call an org Safe makes: registry writes, or owner management on itself. */
function checkOrgSafeInner(safe: Hex, to: Hex, data: Hex): string | null {
  if (isAddressEqual(to, EVERYDAY_CONTRACTS.orgRegistry)) {
    return decode(() => decodeFunctionData({ abi: orgRegistrySafeAbi, data })) ? null : "org Safe registry call not allowlisted";
  }
  if (isAddressEqual(to, safe)) {
    const d = decode(() => decodeFunctionData({ abi: orgSafeAbi, data }));
    if (d && (d.functionName === "addOwnerWithThreshold" || d.functionName === "removeOwner" || d.functionName === "changeThreshold")) {
      return null;
    }
    return "org Safe self-call not allowlisted (owner management only)";
  }
  return "org Safe may only call the OrgRegistry or manage its own owners";
}

/** MultiSend packing: uint8 op ++ address to ++ uint256 value ++ uint256 len ++ data. */
function* unpackMultiSend(txs: Hex): Generator<{ op: number; to: Hex; value: bigint; data: Hex } | null> {
  let i = 0;
  const n = size(txs);
  while (i < n) {
    if (i + 85 > n) return yield null;
    const op = Number(hexToBigInt(sliceHex(txs, i, i + 1)));
    const to = sliceHex(txs, i + 1, i + 21);
    const value = hexToBigInt(sliceHex(txs, i + 21, i + 53));
    const len = Number(hexToBigInt(sliceHex(txs, i + 53, i + 85)));
    if (i + 85 + len > n) return yield null;
    const data = len === 0 ? "0x" : sliceHex(txs, i + 85, i + 85 + len);
    yield { op, to, value, data };
    i += 85 + len;
  }
}

/**
 * Safe.execTransaction on an org Safe, executed by the identity itself: pre-validated
 * signature (r = identity, s = 0, v = 1), no gas refund, value 0. The Safe may call
 * the OrgRegistry or manage its own owners — directly, or batched through
 * MultiSendCallOnly. The target's Safe-ness is a claim the policy verifies.
 */
function classifyOrgSafeExec(safe: Hex, data: Hex, identity: Hex): EverydayVerdict {
  const d = decode(() => decodeFunctionData({ abi: orgSafeAbi, data }));
  if (!d || d.functionName !== "execTransaction") return no("malformed Safe.execTransaction");
  const [to, value, inner, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures] = d.args;
  if (value !== 0n) return no("org Safe transaction must carry value 0");
  if (safeTxGas !== 0n || baseGas !== 0n || gasPrice !== 0n) return no("org Safe transaction must not refund gas");
  if (!isAddressEqual(gasToken, zeroAddress) || !isAddressEqual(refundReceiver, zeroAddress)) {
    return no("org Safe transaction must not refund gas");
  }
  const expectedSig = concatHex([
    encodeAbiParameters([{ type: "address" }], [identity]),
    numberToHex(0, { size: 32 }),
    "0x01",
  ]);
  if (signatures.toLowerCase() !== expectedSig.toLowerCase()) {
    return no("org Safe transaction must be pre-validated by the identity itself");
  }

  if (operation === 0) {
    const err = checkOrgSafeInner(safe, to, inner);
    if (err) return no(err);
  } else if (operation === 1) {
    if (!isAddressEqual(to, ORG_SAFE.multiSendCallOnly)) return no("org Safe DELEGATECALL only into MultiSendCallOnly 1.4.1");
    const ms = decode(() => decodeFunctionData({ abi: orgMultiSendAbi, data: inner }));
    if (!ms) return no("malformed multiSend");
    let count = 0;
    for (const tx of unpackMultiSend(ms.args[0])) {
      if (!tx) return no("malformed multiSend packing");
      if (tx.op !== 0 || tx.value !== 0n) return no("org Safe batch entries must be value-0 CALLs");
      const err = checkOrgSafeInner(safe, tx.to, tx.data);
      if (err) return no(err);
      count++;
    }
    if (count === 0) return no("empty org Safe batch");
  } else {
    return no("unknown Safe operation");
  }
  return { ok: true, tier: "citizen", label: "Safe.execTransaction (org Safe)", orgSafe: safe };
}
