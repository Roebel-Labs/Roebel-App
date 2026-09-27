/**
 * TEST-ONLY offline Gnosis for verifyAccountSignature: emulates viem's
 * publicClient.verifyHash (universal validator) and readContract(isAdmin) for
 *  - EOAs (no code): ecrecover(hash) == address;
 *  - thirdweb Accounts: ERC-1271 = the Account EIP-712 AccountMessage recipe under
 *    the REAL chain id (100), signer must be an admin; counterfactual ones accept
 *    an ERC-6492 wrapper around the same signature;
 *  - passkey Safes: ../../passkey/__tests__/safe-1271-emulator (checked against
 *    fork-proven bytes), no isAdmin function (reverts).
 */
import {
  encodeAbiParameters,
  isAddressEqual,
  parseErc6492Signature,
  recoverAddress,
  recoverTypedDataAddress,
  type Hex,
} from "viem";
import { emulateSafeIsValidSignature } from "../../passkey/__tests__/safe-1271-emulator";
import type { AccountSignatureClient } from "../account-signature-core";

export interface FakeGnosis {
  thirdweb: Map<string, { admins: Set<string>; deployed: boolean }>;
  safes: Map<string, { x: Hex; y: Hex }>;
  down?: boolean;
}

class Named extends Error {
  constructor(name: string, cause?: unknown) {
    super(name);
    this.name = name;
    this.cause = cause;
  }
}

const lc = (a: string) => a.toLowerCase();

export async function thirdwebErc1271(account: Hex, hash: Hex, signature: Hex, admins: Set<string>, chainId = 100) {
  try {
    const signer = await recoverTypedDataAddress({
      domain: { name: "Account", version: "1", chainId, verifyingContract: account },
      types: { AccountMessage: [{ name: "message", type: "bytes" }] },
      primaryType: "AccountMessage",
      message: { message: encodeAbiParameters([{ type: "bytes32" }], [hash]) },
      signature,
    });
    return admins.has(lc(signer));
  } catch {
    return false;
  }
}

export function fakeGnosisClient(w: FakeGnosis): AccountSignatureClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async verifyHash({ address, hash, signature }) {
      calls.push(`verifyHash:${lc(address)}`);
      if (w.down) throw new Named("HttpRequestError");
      const tw = w.thirdweb.get(lc(address));
      if (tw) {
        const { signature: inner } = parseErc6492Signature(signature);
        if (!tw.deployed && inner === signature) return false; // counterfactual: only 6492 works
        return thirdwebErc1271(address, hash, inner, tw.admins);
      }
      const safe = w.safes.get(lc(address));
      if (safe) return emulateSafeIsValidSignature({ safe: address, x: safe.x, y: safe.y, hash, signature });
      try {
        return isAddressEqual(await recoverAddress({ hash, signature }), address);
      } catch {
        return false;
      }
    },
    async readContract({ address, functionName, args }) {
      calls.push(`${functionName}:${lc(address)}`);
      if (w.down) throw new Named("ContractFunctionExecutionError", new Named("HttpRequestError"));
      if (functionName !== "isAdmin") throw new Error(`unexpected ${functionName}`);
      const tw = w.thirdweb.get(lc(address));
      if (tw && tw.deployed) return tw.admins.has(lc(args[0] as string));
      if (w.safes.has(lc(address))) {
        throw new Named("ContractFunctionExecutionError", new Named("ContractFunctionRevertedError"));
      }
      throw new Named("ContractFunctionExecutionError", new Named("ContractFunctionZeroDataError"));
    },
  };
}
