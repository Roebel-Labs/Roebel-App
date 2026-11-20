import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export type LeafKind = "account" | "claimKey";

/** Index-aligned with `CredentialRegistry.LeafKind`. */
export const LEAF_KIND_INDEX: Record<LeafKind, 0 | 1> = { account: 0, claimKey: 1 };

export interface Leaf {
  kind: LeafKind;
  typeId: Hex;
  /** Recipient account (`account`) or the address of the one-time key (`claimKey`). */
  subject: Address;
  /** 0 = no expiry, otherwise the last valid second. */
  validUntil: bigint;
  /** 32 random bytes per leaf. */
  salt: Hex;
}

/** keccak256(bytes.concat(keccak256(abi.encode(uint8(kind), typeId, subject, validUntil, salt)))). */
export function leafHash(leaf: Leaf): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint64" },
        { type: "bytes32" },
      ],
      [LEAF_KIND_INDEX[leaf.kind], leaf.typeId, leaf.subject, leaf.validUntil, leaf.salt],
    ),
  );
  return keccak256(inner);
}

/** The `Leaf` struct argument for viem contract calls. */
export function leafToTuple(leaf: Leaf) {
  return {
    kind: LEAF_KIND_INDEX[leaf.kind],
    typeId: leaf.typeId,
    subject: leaf.subject,
    validUntil: leaf.validUntil,
    salt: leaf.salt,
  } as const;
}
