/**
 * Canonical-payload builder for the founder's key-generation signature.
 *
 * Both the client (when generating the signature) and the server (when
 * verifying it) must build the EXACT same byte string from the same
 * input, otherwise the SHA-256 hash diverges and the API rejects with
 * "signature does not match creatorWallet".
 *
 * Rules:
 * - all wallet addresses lowercased
 * - shareWallets sorted lexicographically before serialization
 * - JSON.stringify with the field order declared in `ordered` below
 *
 * Any change to this function MUST land on client and server in the
 * same commit.
 */

export type CanonicalKeyGenerationInput = {
  governorAddress: string;
  pubkeyX: string;
  pubkeyY: string;
  threshold: number;
  totalShares: number;
  shareWallets: string[];
};

export function buildCanonicalKeyGenerationPayload(
  p: CanonicalKeyGenerationInput
): string {
  const sortedWallets = [...p.shareWallets]
    .map((w) => w.toLowerCase())
    .sort();
  const ordered = {
    governorAddress: p.governorAddress.toLowerCase(),
    pubkeyX: p.pubkeyX,
    pubkeyY: p.pubkeyY,
    threshold: p.threshold,
    totalShares: p.totalShares,
    shareWallets: sortedWallets,
  };
  return JSON.stringify(ordered);
}

/**
 * Message format the founder actually signs. We prepend a domain string
 * so a signature scraped from this app cannot be replayed as a generic
 * "I approve this hash" attestation elsewhere.
 */
export function buildKeyGenerationSignaturePayload(
  canonicalPayload: string,
  sha256Hex: string
): string {
  return `Roebel DAO coordinator key generation v1\n${sha256Hex}`;
}

/**
 * Similarly, a domain-separated payload for the proposal-attach PATCH.
 */
export function buildProposalAttachSignaturePayload(
  generationId: string,
  proposalId: string,
  setPubkeyTxHash: string
): string {
  return [
    "Roebel DAO coordinator proposal attach v1",
    `gen=${generationId}`,
    `proposal=${proposalId}`,
    `tx=${setPubkeyTxHash}`,
  ].join("\n");
}
