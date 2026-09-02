/**
 * Shared helpers for the Roebel ONCHAIN TEST ENVIRONMENT.
 *
 * This is a parallel AttesterNFTv2 + CitizenNFTv2 pair on Gnosis mainnet (chain 100)
 * that is owned by a burner EOA instead of the Attester Safe, and whose migration is
 * deliberately NEVER finalized. That combination is what makes solo testing possible:
 * the owner can mint identities at will, and three script-controlled co-signer EOAs
 * hold enough Attester + Citizen NFTs to satisfy any approval quorum on their own.
 *
 * NOTHING here may ever touch the production contracts. See assertNotProduction().
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const MANIFEST = path.resolve(__dirname, "../../deployments/gnosis-test.json");

/** Salt for deriving co-signer keys from the burner key. Changing it changes every co-signer. */
const COSIGNER_SALT = "roebel-onchain-test-env/cosigner/v1";

/** Production Gnosis v2 addresses. Guarded against, never used. */
const PRODUCTION_ADDRESSES = [
  "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82", // AttesterNFTv2 (prod)
  "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5", // CitizenNFTv2  (prod)
  "0x5F5e499Dc1872c2Ce19a4b50cd10f680e78E3Ba3", // MaciAttesterGovernor (prod)
  "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa", // Attester Safe (prod owner)
].map((a) => a.toLowerCase());

/** Throw if an address we are about to WRITE to belongs to the production stack. */
function assertNotProduction(...addresses) {
  for (const a of addresses) {
    if (a && PRODUCTION_ADDRESSES.includes(String(a).toLowerCase())) {
      throw new Error(
        `REFUSING: ${a} is a PRODUCTION contract. The test-env scripts must never write to prod.`
      );
    }
  }
}

/**
 * Opt-in guard. Every mutating test-env script requires ROEBEL_TEST_ENV=1 so it can
 * never be run by muscle memory or by copy-pasting a prod deploy command.
 */
function assertTestEnvOptIn() {
  if (process.env.ROEBEL_TEST_ENV !== "1") {
    throw new Error("REFUSING: set ROEBEL_TEST_ENV=1 to run a test-environment script.");
  }
}

function burnerKey() {
  const raw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!raw) throw new Error("DEPLOYER_PRIVATE_KEY missing from contracts/governor-contract/.env");
  const pk = raw.startsWith("0x") ? raw : "0x" + raw;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("DEPLOYER_PRIVATE_KEY is not a 32-byte hex key");
  return pk;
}

/**
 * Deterministically derive N co-signer EOAs from the burner key.
 *
 * These hold BOTH Attester and Citizen NFTs, so scripts can supply an entire quorum.
 * Because they are derived (not random) they are recoverable from the burner key
 * alone -- no extra secret to store, and a fresh checkout can drive approvals again.
 *
 * WHY FIVE. CitizenNFTv2.approveRequest enforces one approval per wallet, so a dual
 * holder counts toward exactly ONE role. Under prod-shaped bands with 5 attesters a
 * revocation needs ceil(0.67*5)=4 attester signatures PLUS 1 citizen signature = 5
 * distinct wallets. Three co-signers (the constructor minimum) can join but can never
 * revoke. Five is the smallest count that can drive every gate; the caps (7/5) mean it
 * stays sufficient as citizens accumulate. Minting more than ~7 test attesters breaks
 * this again -- see docs/ONCHAIN_TEST_ENVIRONMENT.md.
 */
function deriveCosigners(count = 5) {
  const pk = burnerKey();
  const wallets = [];
  for (let i = 1; i <= count; i++) {
    const child = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "string", "uint256"], [pk, COSIGNER_SALT, i])
    );
    wallets.push(new ethers.Wallet(child));
  }
  return wallets;
}

function provider() {
  return new ethers.JsonRpcProvider(process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com");
}

function burnerWallet(p = provider()) {
  return new ethers.Wallet(burnerKey(), p);
}

function manifestExists() {
  return fs.existsSync(MANIFEST);
}

function loadManifest() {
  if (!manifestExists()) {
    throw new Error("deployments/gnosis-test.json missing -- run scripts/test-env/deploy.cjs first.");
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (m.environment !== "test") throw new Error("Manifest is not marked environment=test. Refusing.");
  assertNotProduction(m.contracts.attesterNFTv2, m.contracts.citizenNFTv2);
  return m;
}

function saveManifest(m) {
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n");
  return MANIFEST;
}

/** Bands are [percentBps, floor, cap]; cap 65535 == no cap; [0,n,n] == fixed n. */
const NO_CAP = 65535;

/** Production-shaped bands. The threshold math is a thing we WANT to exercise. */
const PROD_SHAPED = {
  attester: { approval: [5000, 3, 7], rejection: [5000, 3, 7] },
  citizen: {
    attestationAttester: [3000, 2, 7],
    attestationCitizen: [0, 1, 1],
    revocationAttester: [6700, 3, NO_CAP],
    revocationCitizen: [0, 1, 1],
    rejectionAttester: [2500, 2, 5],
    rejectionCitizen: [2500, 2, 5],
  },
};

/** Everything 1-of-1: the fastest possible loop when you are iterating on UI. */
const FAST = {
  attester: { approval: [0, 1, 1], rejection: [0, 1, 1] },
  citizen: {
    attestationAttester: [0, 1, 1],
    attestationCitizen: [0, 1, 1],
    revocationAttester: [0, 1, 1],
    revocationCitizen: [0, 1, 1],
    rejectionAttester: [0, 1, 1],
    rejectionCitizen: [0, 1, 1],
  },
};

function loadArtifact(name) {
  const p = path.resolve(__dirname, `../../artifacts/contracts/verification-system/${name}.sol/${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Artifact for ${name} missing -- run: npx hardhat compile`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

module.exports = {
  MANIFEST,
  NO_CAP,
  PROD_SHAPED,
  FAST,
  assertNotProduction,
  assertTestEnvOptIn,
  burnerKey,
  burnerWallet,
  deriveCosigners,
  loadArtifact,
  loadManifest,
  manifestExists,
  provider,
  saveManifest,
};
