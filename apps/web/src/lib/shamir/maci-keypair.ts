/**
 * Browser-side Babyjubjub coordinator keypair generation.
 *
 * Thin wrapper over maci-domainobjs so the generate-key ceremony can
 * stay self-contained. The keypair is generated in the founder's tab,
 * split + sealed there, and the privkey is dropped from memory the
 * moment the wizard finishes. We never serialize the privkey to disk
 * or send it across the wire.
 *
 * Behavior:
 * - generateBabyjubjubKeypair() — fresh keypair
 * - serializePubKey({x, y}) — string form used for display + Supabase
 * - shortPrivKeyFingerprint(macisk) — last-8-hex of the serialized key,
 *   so the founder can do a one-glance human verification ("did the
 *   page actually load a fresh key or is it showing me a cached one?")
 */

import { Keypair } from "maci-domainobjs";

export type CoordinatorPubKey = {
  x: bigint;
  y: bigint;
};

export type CoordinatorKeypair = {
  /** macisk.<64 hex chars> — feed straight into `splitSecret` after `macipkToBytes`. */
  privKeySerialized: string;
  /** Babyjubjub pubkey, as contract-ready BigInts. */
  pubKey: CoordinatorPubKey;
  /** Same pubkey serialized as `macipk.<…>` — handy for QR / clipboard. */
  pubKeySerialized: string;
};

export function generateBabyjubjubKeypair(): CoordinatorKeypair {
  const kp = new Keypair();
  const { x, y } = kp.pubKey.asContractParam();
  return {
    privKeySerialized: kp.privKey.serialize(),
    pubKey: { x: BigInt(x.toString()), y: BigInt(y.toString()) },
    pubKeySerialized: kp.pubKey.serialize(),
  };
}

export function serializePubKeyToHex(pub: CoordinatorPubKey): {
  xHex: string;
  yHex: string;
} {
  return {
    xHex: `0x${pub.x.toString(16).padStart(64, "0")}`,
    yHex: `0x${pub.y.toString(16).padStart(64, "0")}`,
  };
}

export function shortPrivKeyFingerprint(macisk: string): string {
  const tail = macisk.slice(-8);
  return `…${tail}`;
}
