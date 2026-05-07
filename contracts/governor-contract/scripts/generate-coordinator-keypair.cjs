#!/usr/bin/env node
/**
 * Generates a fresh MACI Babyjubjub coordinator keypair (CommonJS so it works
 * without ts-node).
 *
 * stdout: public key (safe to log)
 * stderr: PRIVATE key (sensitive — pipe to a file you immediately move into
 *         Fly secrets and shred locally).
 *
 * Usage:
 *   node scripts/generate-coordinator-keypair.cjs > pub.txt 2> priv.txt
 */
const { Keypair } = require("maci-domainobjs");

const keypair = new Keypair();
const pubKeySerialized = keypair.pubKey.serialize();
const privKeySerialized = keypair.privKey.serialize();
const { x: pubX, y: pubY } = keypair.pubKey.asContractParam();

console.log("=== MACI Coordinator Public Key ===");
console.log("COORDINATOR_PUBKEY_X=" + pubX.toString());
console.log("COORDINATOR_PUBKEY_Y=" + pubY.toString());
console.log("Serialized: " + pubKeySerialized);

console.error("=== MACI Coordinator PRIVATE Key (sensitive — redirect stderr) ===");
console.error(privKeySerialized);
