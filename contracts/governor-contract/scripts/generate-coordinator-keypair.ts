/**
 * Generates a fresh MACI Babyjubjub coordinator keypair.
 *
 * RUN THIS ON THE MACHINE THAT WILL HOST THE COORDINATOR SERVICE — not on a
 * developer laptop. The private key is the secret used to decrypt encrypted
 * ballots. Anyone with this key can read every vote.
 *
 * Output:
 *   stdout — the (x, y) point of the public key (paste into .env as
 *            COORDINATOR_PUBKEY_X / COORDINATOR_PUBKEY_Y) plus a serialized
 *            macipk.<…> form for client-side use.
 *   stderr — the private key (macisk.<…>). Pipe stderr into a sealed secret store
 *            (Fly secrets, 1Password) and never write it to disk.
 *
 * For the Layer-2 (Shamir-split) future: split the macisk.<…> string with
 * `shamir-secret-sharing` after generation and distribute shares to attesters.
 *
 * Usage:
 *   npx ts-node scripts/generate-coordinator-keypair.ts > pubkey.txt 2> private.key
 *   # then immediately move private.key to your secret manager and shred it
 */
import { Keypair, PrivKey, PubKey } from "maci-domainobjs";

function main(): void {
  const keypair = new Keypair();
  const pubKeySerialized = keypair.pubKey.serialize();
  const privKeySerialized = keypair.privKey.serialize();
  const { x: pubX, y: pubY } = keypair.pubKey.asContractParam();

  // Public — safe to log to stdout
  console.log("=== MACI Coordinator Public Key ===");
  console.log(`COORDINATOR_PUBKEY_X=${pubX.toString()}`);
  console.log(`COORDINATOR_PUBKEY_Y=${pubY.toString()}`);
  console.log(`Serialized: ${pubKeySerialized}`);

  // Private — only to stderr, redirect into a secret store
  console.error("=== MACI Coordinator PRIVATE Key (sensitive — redirect stderr) ===");
  console.error(privKeySerialized);
}

main();
