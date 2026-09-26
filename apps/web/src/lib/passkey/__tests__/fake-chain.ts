/**
 * In-memory Gnosis for the sponsor policy / route tests. The default world:
 *   - SAFE (the golden-vector passkey Safe for KEY) is deployed as a genuine
 *     passkey Safe: SafeProxy 1.4.1 runtime, singleton Safe L2 1.4.1,
 *     fallback handler + module Safe4337Module, owner SharedSigner configured
 *     with KEY;
 *   - LEGACY and OTHER_LEGACY are thirdweb Account proxies holding a
 *     CitizenNFTv2, both with EOA as admin; SAFE is already admin of LEGACY;
 *   - a handover signature is valid iff it equals GOOD_SIG (anything else
 *     makes verifySignerPermissionRequest revert, like ECDSA.recover does).
 */
import { getAddress, zeroAddress, type Hex } from "viem";
import vector from "./passkey-safe-vector.json";
import { CITIZEN_NFT, LEGACY_ACCOUNT_PROXY_CODE, type ChainReader } from "../sponsor-policy";
import {
  FALLBACK_HANDLER_SLOT,
  PASSKEY_SAFE,
  SAFE_PROXY_RUNTIME_CODE,
  WEBAUTHN_VERIFIERS,
} from "../safe-address";

export const KEY = { x: vector.x as Hex, y: vector.y as Hex };
export const SAFE = getAddress(vector.safeAddress) as Hex;
export const LEGACY = "0x1111111111111111111111111111111111111111" as Hex;
export const OTHER_LEGACY = "0x5555555555555555555555555555555555555555" as Hex;
export const EOA = "0x6666666666666666666666666666666666666666" as Hex;
export const RECIPIENT = "0x3333333333333333333333333333333333333333" as Hex;
export const GUARDIAN = "0x4444444444444444444444444444444444444444" as Hex;
export const RECOVERED_SIGNER = "0x7777777777777777777777777777777777777777" as Hex;
export const GOOD_SIG = `0x${"ab".repeat(65)}` as Hex;
export const BAD_SIG = `0x${"cd".repeat(65)}` as Hex;

const word = (a: Hex) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
const k = (...parts: Array<string | bigint>) => parts.map((p) => String(p).toLowerCase()).join(":");

export interface FakeWorld {
  codes: Map<string, Hex>;
  storage: Map<string, Hex>;
  admins: Set<string>;
  modules: Set<string>;
  owners: Map<string, Hex[]>;
  sharedConfig: Map<string, { x: bigint; y: bigint; verifiers: bigint }>;
  webauthnSigners: Map<string, Hex>;
  citizens: Set<string>;
  executedUids: Set<string>;
}

export function makePasskeySafe(w: FakeWorld, safe: Hex, key = KEY) {
  w.codes.set(safe.toLowerCase(), SAFE_PROXY_RUNTIME_CODE);
  w.storage.set(k(safe, word("0x00")), word(PASSKEY_SAFE.singletonL2));
  w.storage.set(k(safe, FALLBACK_HANDLER_SLOT), word(PASSKEY_SAFE.safe4337Module));
  w.modules.add(k(safe, PASSKEY_SAFE.safe4337Module));
  w.modules.add(k(safe, PASSKEY_SAFE.socialRecoveryModule));
  w.owners.set(safe.toLowerCase(), [PASSKEY_SAFE.sharedSigner]);
  w.sharedConfig.set(safe.toLowerCase(), { x: BigInt(key.x), y: BigInt(key.y), verifiers: WEBAUTHN_VERIFIERS });
}

export function defaultWorld(): FakeWorld {
  const w: FakeWorld = {
    codes: new Map([
      [LEGACY.toLowerCase(), LEGACY_ACCOUNT_PROXY_CODE],
      [OTHER_LEGACY.toLowerCase(), LEGACY_ACCOUNT_PROXY_CODE],
      [RECIPIENT.toLowerCase(), "0x6080604052348015600f57600080fd5b50"],
    ]),
    storage: new Map(),
    admins: new Set([k(LEGACY, EOA), k(OTHER_LEGACY, EOA), k(LEGACY, SAFE)]),
    modules: new Set(),
    owners: new Map(),
    sharedConfig: new Map(),
    webauthnSigners: new Map(),
    citizens: new Set([LEGACY.toLowerCase(), OTHER_LEGACY.toLowerCase()]),
    executedUids: new Set(),
  };
  makePasskeySafe(w, SAFE);
  return w;
}

export type FakeChain = ChainReader & { reads: string[]; world: FakeWorld };

/** `mutate` edits the default world before use. */
export function fakeChain(mutate?: (w: FakeWorld) => void): FakeChain {
  const w = defaultWorld();
  mutate?.(w);
  const reads: string[] = [];
  const isAdmin = (account: Hex, signer: Hex) => w.admins.has(k(account, signer));
  return {
    reads,
    world: w,
    async getCode(a) {
      reads.push("getCode");
      return w.codes.get(a.toLowerCase());
    },
    async getStorageAt(a, slot) {
      reads.push("getStorageAt");
      return w.storage.get(k(a, slot)) ?? word("0x00");
    },
    async isAdmin(account, signer) {
      reads.push("isAdmin");
      return isAdmin(account, signer);
    },
    async isModuleEnabled(safe, module) {
      reads.push("isModuleEnabled");
      return w.modules.has(k(safe, module));
    },
    async getOwners(safe) {
      reads.push("getOwners");
      return w.owners.get(safe.toLowerCase()) ?? [];
    },
    async getSharedSignerConfiguration(safe) {
      reads.push("getSharedSignerConfiguration");
      return w.sharedConfig.get(safe.toLowerCase()) ?? { x: 0n, y: 0n, verifiers: 0n };
    },
    async getWebAuthnSigner(x, y, verifiers) {
      reads.push("getWebAuthnSigner");
      return w.webauthnSigners.get(k(x, y, verifiers)) ?? zeroAddress;
    },
    async balanceOf(token, owner) {
      reads.push("balanceOf");
      if (token.toLowerCase() !== CITIZEN_NFT.toLowerCase()) return 0n;
      return w.citizens.has(owner.toLowerCase()) ? 1n : 0n;
    },
    async verifySignerPermissionRequest(account, req, signature) {
      reads.push("verifySignerPermissionRequest");
      if (signature.toLowerCase() !== GOOD_SIG) return null; // ECDSA.recover reverts
      return { success: isAdmin(account, EOA) && !w.executedUids.has(req.uid.toLowerCase()), signer: EOA };
    },
  };
}

export function brokenChain(): ChainReader {
  const fail = async (): Promise<never> => {
    throw new Error("rpc down https://rpc.example/?apikey=SECRET");
  };
  return {
    getCode: fail,
    getStorageAt: fail,
    isAdmin: fail,
    isModuleEnabled: fail,
    getOwners: fail,
    getSharedSignerConfiguration: fail,
    getWebAuthnSigner: fail,
    balanceOf: fail,
    verifySignerPermissionRequest: fail,
  };
}
