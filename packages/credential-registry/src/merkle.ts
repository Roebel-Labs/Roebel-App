import { concat, keccak256, type Hex } from "viem";

function pairHash(a: Hex, b: Hex): Hex {
  return a.toLowerCase() <= b.toLowerCase() ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

/**
 * Sorted-pair Merkle tree matching OpenZeppelin `MerkleProof`: leaves sorted
 * ascending, neighbours hashed commutatively, an unpaired last node moves up.
 */
export function buildTree(leafHashes: readonly Hex[]): { root: Hex; proofOf(leaf: Hex): Hex[] } {
  if (leafHashes.length === 0) throw new Error("empty leaf list");
  const sorted = leafHashes.map((h) => h.toLowerCase() as Hex).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) throw new Error(`duplicate leaf hash ${sorted[i]}`);
  }
  const layers: Hex[][] = [sorted];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(i + 1 < cur.length ? pairHash(cur[i], cur[i + 1]) : cur[i]);
    }
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  return {
    root,
    proofOf(leaf: Hex): Hex[] {
      let idx = sorted.indexOf(leaf.toLowerCase() as Hex);
      if (idx < 0) throw new Error("leaf not in tree");
      const proof: Hex[] = [];
      for (let l = 0; l < layers.length - 1; l++) {
        const sib = idx ^ 1;
        if (sib < layers[l].length) proof.push(layers[l][sib]);
        idx >>= 1;
      }
      return proof;
    },
  };
}

export function verifyProof(root: Hex, leaf: Hex, proof: readonly Hex[]): boolean {
  let h = leaf.toLowerCase() as Hex;
  for (const p of proof) h = pairHash(h, p);
  return h === (root.toLowerCase() as Hex);
}
