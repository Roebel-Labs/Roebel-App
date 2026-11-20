import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { claimDigest, signClaim } from "../src/claim";
import { credentialTypeId, localIdFromUuid } from "../src/ids";
import { leafHash, leafToTuple, type Leaf } from "../src/leaf";
import { buildTree } from "../src/merkle";

const ORG_UUID = "6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10";
const TYPE_UUID = "0b9e4c55-7a1f-4e3a-8d2c-5a6b7c8d9e0f";
const CLAIM_KEY = ("0x" + "01".repeat(32)) as Hex;
const ACCOUNT_1 = ("0x" + "11".repeat(20)) as Address;
const ACCOUNT_2 = ("0x" + "22".repeat(20)) as Address;
const CLAIMER = ("0x" + "33".repeat(20)) as Address;
const REGISTRY = "0x000000000000000000000000000000000000c0de" as Address;
const CHAIN_ID = 100;
const BATCH_ID = 1n;

export async function makeVector() {
  const orgId = orgIdFromUuid(ORG_UUID) as Hex;
  const localId = localIdFromUuid(TYPE_UUID);
  const typeId = credentialTypeId(orgId, localId);
  const keyAddress = privateKeyToAccount(CLAIM_KEY).address;

  const raw: Leaf[] = [
    { kind: "account", typeId, subject: ACCOUNT_1, validUntil: 0n, salt: ("0x" + "aa".repeat(32)) as Hex },
    { kind: "account", typeId, subject: ACCOUNT_2, validUntil: 1798761600n, salt: ("0x" + "bb".repeat(32)) as Hex },
    { kind: "claimKey", typeId, subject: keyAddress, validUntil: 0n, salt: ("0x" + "cc".repeat(32)) as Hex },
  ];
  const hashes = raw.map(leafHash);
  const tree = buildTree(hashes);
  const claimLeaf = hashes[2];
  const p = { chainId: CHAIN_ID, registry: REGISTRY, batchId: BATCH_ID, leaf: claimLeaf, account: CLAIMER };

  return {
    orgId,
    localId,
    typeId,
    leaves: raw.map((l, i) => {
      const t = leafToTuple(l);
      return {
        kind: l.kind,
        typeId: l.typeId,
        subject: l.subject,
        validUntil: l.validUntil.toString(),
        salt: l.salt,
        tuple: [t.kind, t.typeId, t.subject, t.validUntil.toString(), t.salt],
        hash: hashes[i],
        proof: tree.proofOf(hashes[i]),
      };
    }),
    root: tree.root,
    claim: {
      privateKey: CLAIM_KEY,
      signer: keyAddress,
      account: CLAIMER,
      batchId: BATCH_ID.toString(),
      chainId: CHAIN_ID,
      registry: REGISTRY,
      digest: claimDigest(p),
      signature: await signClaim(CLAIM_KEY, p),
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = new URL("../test/vectors/credential-vector.json", import.meta.url);
  writeFileSync(out, JSON.stringify(await makeVector(), null, 2) + "\n");
  console.log(`wrote ${fileURLToPath(out)}`);
}
