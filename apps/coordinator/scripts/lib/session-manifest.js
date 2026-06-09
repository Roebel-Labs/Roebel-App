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
 *
 * Handles both:
 *   1. EOA / EIP-191 personal_sign — standard ethers.verifyMessage path.
 *   2. ERC-1271 smart-account (thirdweb inAppWallet + smartAccount) —
 *      verifyMessage recovers the EOA underneath the smart account, not
 *      the smart-account address itself. We fall back to calling
 *      isValidSignature(hash, sig) on the smart-account contract.
 *
 * The fallback only runs when EIP-191 recovery doesn't match AND `wallet`
 * has code on-chain. Plain EOAs never trigger an RPC call.
 *
 * `wallet` is the address the Attester is claiming; we accept the
 * submission iff one of the two paths confirms it.
 */
const ERC1271_MAGIC_VALUE = "0x1626ba7e";

async function verifySubmissionSignature({
  sessionPubkeyBase64,
  shareIndex,
  wallet,
  signature,
}) {
  const payload = buildSubmissionPayload({
    sessionPubkeyBase64,
    shareIndex,
    wallet,
  });

  // Fast path: EIP-191 recovery.
  try {
    const recovered = ethers.verifyMessage(payload, signature);
    if (recovered.toLowerCase() === wallet.toLowerCase()) return true;
  } catch {
    // fall through to ERC-1271
  }

  // ERC-1271 fallback for smart accounts.
  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) {
    console.warn(
      "[session-manifest] BASE_RPC_URL not set — cannot do ERC-1271 fallback",
    );
    return false;
  }
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      batchMaxCount: 1,
    });
    const code = await provider.getCode(wallet);
    if (!code || code === "0x") {
      // Plain EOA — EIP-191 already failed, signature is invalid.
      return false;
    }
    const contract = new ethers.Contract(
      wallet,
      [
        "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
      ],
      provider,
    );
    const hash = ethers.hashMessage(payload);
    const result = await contract.isValidSignature(hash, signature);
    return (
      typeof result === "string" &&
      result.toLowerCase() === ERC1271_MAGIC_VALUE
    );
  } catch (err) {
    console.warn(
      `[session-manifest] ERC-1271 verify failed for ${wallet}: ${err?.message ?? err}`,
    );
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
