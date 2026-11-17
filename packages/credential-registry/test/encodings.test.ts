import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  COMMUNITY_ORG_ID,
  RESERVED_TYPE_IDS,
  credentialTypeId,
  localIdFromName,
  localIdFromUuid,
  buildTree,
  verifyProof,
  leafHash,
  signClaim,
  recoverClaimSigner,
  type Leaf,
} from "../src/index";
import { makeVector } from "../scripts/make-vector";

const H1 = keccak256(toBytes("one"));

test("reserved type ids are the contract constants", () => {
  assert.equal(RESERVED_TYPE_IDS.citizen, "0x29b30918374d5511c2e04c13b53cdf777411c64e6c26e82641ac55603c5dacb3");
  assert.equal(RESERVED_TYPE_IDS.attester, "0xf0f85ad4e1a9d51549974d05172850f7fba29de6d4c95221f26a47f1aeaa8d5d");
  assert.equal(RESERVED_TYPE_IDS.guest, "0xd3275120b39f46eafbcc7a5ce0e5397f25f1eaeb72d17620ddf39886beab17b7");
  assert.equal(
    RESERVED_TYPE_IDS.guest,
    credentialTypeId(COMMUNITY_ORG_ID, localIdFromName("guest")),
  );
});

test("localIdFromUuid lowercases and rejects non-uuids", () => {
  assert.equal(
    localIdFromUuid("6F1C2C7E-0D3A-4B5E-9A51-3F7A1D2B9C10"),
    localIdFromUuid("6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10"),
  );
  assert.throws(() => localIdFromUuid("verein"));
});

test("a single leaf is its own root with an empty proof", () => {
  const t = buildTree([H1]);
  assert.equal(t.root, H1);
  assert.deepEqual(t.proofOf(H1), []);
});

function hashes(n: number): Hex[] {
  return Array.from({ length: n }, (_, i) => keccak256(toBytes(`leaf-${i}`)));
}

test("every leaf of 1, 2, 3, 5, 70 and 1000 leaves verifies; a foreign leaf and a truncated proof do not", () => {
  const foreign = keccak256(toBytes("foreign"));
  for (const n of [1, 2, 3, 5, 70, 1000]) {
    const hs = hashes(n);
    const t = buildTree(hs);
    for (const h of hs) assert.ok(verifyProof(t.root, h, t.proofOf(h)), `n=${n}`);
    assert.equal(verifyProof(t.root, foreign, t.proofOf(hs[0])), false);
    if (n > 1) {
      const p = t.proofOf(hs[0]);
      assert.equal(verifyProof(t.root, hs[0], p.slice(0, -1)), false);
    }
  }
});

test("the tree does not depend on input order", () => {
  const hs = hashes(37);
  const shuffled = [...hs].reverse().sort((a, b) => (keccak256(a) < keccak256(b) ? -1 : 1));
  assert.equal(buildTree(shuffled).root, buildTree(hs).root);
});

test("duplicate leaf hashes and an empty list are refused", () => {
  assert.throws(() => buildTree([]));
  assert.throws(() => buildTree([H1, H1]));
});

test("a claim signature recovers to the claim key and to nothing else when batch, leaf or account changes", async () => {
  const key = ("0x" + "01".repeat(32)) as Hex;
  const signer = privateKeyToAccount(key).address;
  const p = {
    chainId: 100,
    registry: "0x000000000000000000000000000000000000c0de" as const,
    batchId: 1n,
    leaf: H1,
    account: "0x3333333333333333333333333333333333333333" as const,
  };
  const signature = await signClaim(key, p);
  assert.equal(await recoverClaimSigner({ ...p, signature }), signer);
  for (const changed of [
    { ...p, batchId: 2n },
    { ...p, leaf: keccak256(toBytes("other")) },
    { ...p, account: "0x4444444444444444444444444444444444444444" as const },
    { ...p, chainId: 1 },
  ]) {
    assert.notEqual(await recoverClaimSigner({ ...changed, signature }), signer);
  }
});

test("leaf hash is the double keccak of five words", () => {
  const leaf: Leaf = {
    kind: "account",
    typeId: H1,
    subject: "0x1111111111111111111111111111111111111111",
    validUntil: 0n,
    salt: ("0x" + "aa".repeat(32)) as Hex,
  };
  assert.match(leafHash(leaf), /^0x[0-9a-f]{64}$/);
  assert.notEqual(leafHash(leaf), leafHash({ ...leaf, kind: "claimKey" }));
});

test("the committed vector file is reproduced exactly", async () => {
  const file = JSON.parse(readFileSync(new URL("./vectors/credential-vector.json", import.meta.url), "utf8"));
  const fresh = JSON.parse(JSON.stringify(await makeVector()));
  assert.deepEqual(fresh, file);
});
