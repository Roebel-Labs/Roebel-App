// Session manifest signing + share submission verification.
//
// At session boot:
//   - Reconstructor generates a Curve25519 keypair (the session pubkey).
//   - We sign the manifest { sessionId, pollId, keyGenerationId,
//     attesterAllowlist, sessionPubkeyBase64, expiresAt } with the
//     submitter's COORDINATOR_ETH_PRIV EOA. Attester browsers verify the
//     signature against MACI_INFRA.coordinator before trusting the session
//     pubkey — this is the trust root for the entire reconstruction.
//
// At share submission:
//   - Each Attester signs `keccak256(sessionPubkey || shareIndex || wallet)`
//     with their thirdweb wallet. We verify recovery here so the
//     reconstructor refuses anything that didn't come from a real Attester.

const { ethers } = require("ethers");
const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");

const MANIFEST_DOMAIN = "Roebel DAO coordinator session manifest v1";
const SUBMISSION_DOMAIN = "Roebel DAO coordinator share submission v1";

function buildManifestPayload(manifest) {
  const ordered = {
    sessionId: manifest.sessionId,
    pollId: manifest.pollId,
    keyGenerationId: manifest.keyGenerationId,
    governorAddress: manifest.governorAddress.toLowerCase(),
    sessionPubkeyBase64: manifest.sessionPubkeyBase64,
    attesterAllowlist: [...manifest.attesterAllowlist]
      .map((a) => a.toLowerCase())
      .sort(),
    expiresAt: manifest.expiresAt,
  };
  const canonical = JSON.stringify(ordered);
  return `${MANIFEST_DOMAIN}\n${canonical}`;
}

/**
 * Sign a session manifest with the coordinator EOA key.
 * Returns the 0x-prefixed ECDSA signature.
 */
function signManifest(manifest, ethPrivKey) {
  const payload = buildManifestPayload(manifest);
  const pk = ethPrivKey.startsWith("0x") ? ethPrivKey : "0x" + ethPrivKey;
  const wallet = new ethers.Wallet(pk);
  return wallet.signMessageSync(payload);
}

/**
 * Verify a manifest signature recovers to `expectedSigner` (typically the
 * MACI_INFRA.coordinator address).
 */
function verifyManifest(manifest, signature, expectedSigner) {
  try {
    const payload = buildManifestPayload(manifest);
    const recovered = ethers.verifyMessage(payload, signature);
    return recovered.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Generate a one-shot session keypair. Curve25519 because we use the same
 * lib (tweetnacl) everywhere and we'll later use this keypair to wrap the
 * inbound share submissions if we ever want to add a layer of forward
 * secrecy. For v1 we only use the pubkey as a session identifier.
 */
function generateSessionKeypair() {
  return nacl.box.keyPair();
}

function buildSubmissionPayload({ sessionPubkeyBase64, shareIndex, wallet }) {
  const canonical = JSON.stringify({
    sessionPubkeyBase64,
    shareIndex,
    wallet: wallet.toLowerCase(),
  });
  return `${SUBMISSION_DOMAIN}\n${canonical}`;
}

/**
 * Verify a share submission signature recovers to `wallet`.
 */
function verifySubmissionSignature({
  sessionPubkeyBase64,
  shareIndex,
  wallet,
  signature,
}) {
  try {
    const payload = buildSubmissionPayload({
      sessionPubkeyBase64,
      shareIndex,
      wallet,
    });
    const recovered = ethers.verifyMessage(payload, signature);
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  return naclUtil.encodeBase64(bytes);
}

function base64ToBytes(b64) {
  return naclUtil.decodeBase64(b64);
}

/**
 * Hash a submission for the audit log — non-secret, just a proof the
 * Attester showed up at this session.
 */
function submissionProofHash({ sessionPubkeyBase64, shareIndex, wallet }) {
  const canonical = JSON.stringify({
    sessionPubkeyBase64,
    shareIndex,
    wallet: wallet.toLowerCase(),
  });
  return ethers.id(canonical);
}

module.exports = {
  buildManifestPayload,
  signManifest,
  verifyManifest,
  generateSessionKeypair,
  buildSubmissionPayload,
  verifySubmissionSignature,
  bytesToBase64,
  base64ToBytes,
  submissionProofHash,
  MANIFEST_DOMAIN,
  SUBMISSION_DOMAIN,
};
