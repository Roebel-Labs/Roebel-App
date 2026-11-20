import { hashTypedData, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface ClaimParams {
  chainId: number;
  registry: Address;
  batchId: bigint;
  leaf: Hex;
  account: Address;
}

/** EIP-712 `Claim(uint64 batchId,bytes32 leaf,address account)` under the registry domain. */
export function claimTypedData(p: ClaimParams) {
  return {
    domain: {
      name: "CredentialRegistry",
      version: "1",
      chainId: p.chainId,
      verifyingContract: p.registry,
    },
    types: {
      Claim: [
        { name: "batchId", type: "uint64" },
        { name: "leaf", type: "bytes32" },
        { name: "account", type: "address" },
      ],
    },
    primaryType: "Claim",
    message: { batchId: p.batchId, leaf: p.leaf, account: p.account },
  } as const;
}

export function claimDigest(p: ClaimParams): Hex {
  return hashTypedData(claimTypedData(p));
}

export async function signClaim(claimKey: Hex, p: ClaimParams): Promise<Hex> {
  return privateKeyToAccount(claimKey).signTypedData(claimTypedData(p));
}

export async function recoverClaimSigner(p: ClaimParams & { signature: Hex }): Promise<Address> {
  return recoverTypedDataAddress({ ...claimTypedData(p), signature: p.signature });
}
