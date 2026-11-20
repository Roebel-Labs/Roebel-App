/**
 * Spec 5.7: the server-side signature rule accepts the expert-path Safe (single ECDSA owner,
 * counterfactual, ERC-6492), for every endpoint message format. Offline: routing only (rule a,
 * never the Safe-admin envelope (b) or the thirdweb fallback (c)); the live test is the proof.
 * Run: cd apps/web && npx tsx --test src/lib/auth/__tests__/expert-safe-signature.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashMessage, hashTypedData, serializeErc6492Signature, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createAccountSignatureVerifier } from "../verify-account-signature";
import { fakeGnosisClient, type FakeGnosis } from "./fake-gnosis";
import { safeMessageHash } from "../../passkey/__tests__/safe-1271-emulator";
import { PASSKEY_SAFE, ecdsaSafeFactoryData, predictEcdsaSafeAddress } from "../../passkey/safe-address";
import { buildExpertTexts } from "./expert-safe-texts";
import vec from "../../passkey/__tests__/ecdsa-safe-vector.json";

// Hardhat junk phrase, key 0 / key 1 (public, test-only).
const OWNER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const OTHER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8468f23b12de3a2baa");
const SAFE = predictEcdsaSafeAddress(OWNER.address) as Hex;
const FACTORY_DATA = ecdsaSafeFactoryData(OWNER.address);
const FACTORY = PASSKEY_SAFE.proxyFactory as Hex;

function world(deployed = false): FakeGnosis {
  return {
    thirdweb: new Map(),
    safes: new Map(),
    ecdsaSafes: new Map([[SAFE.toLowerCase(), { owner: OWNER.address, deployed, factoryData: FACTORY_DATA }]]),
  };
}

/** Signs `digest` as the expert Safe: ECDSA over the SafeMessage hash. */
async function signAsExpertSafe(key: typeof OWNER, digest: Hex): Promise<Hex> {
  return key.sign({ hash: safeMessageHash(SAFE, digest) });
}
const wrap = (sig: Hex) => serializeErc6492Signature({ address: FACTORY, data: FACTORY_DATA, signature: sig });

test("fixture: the offline Safe digest and address match the fork-proven vector", async () => {
  assert.equal(SAFE.toLowerCase(), "0xcb7AF8976B81Cd123D59ccdeb5c3419c35a06441".toLowerCase());
  assert.equal(safeMessageHash(SAFE, vec.erc1271.hash as Hex), vec.erc1271.safeMessageHash);
  assert.equal(await signAsExpertSafe(OWNER, vec.erc1271.hash as Hex), vec.erc1271.signature);
});

for (const [name, text] of Object.entries(buildExpertTexts(SAFE))) {
  test(`${name}: the counterfactual expert Safe's 6492 signature takes rule (a) only`, async () => {
    const client = fakeGnosisClient(world());
    const verify = createAccountSignatureVerifier(client);
    const sig = wrap(await signAsExpertSafe(OWNER, hashMessage(text)));
    assert.equal(await verify({ address: SAFE, message: text, signature: sig }), true);
    assert.deepEqual(client.calls, [`verifyHash:${SAFE.toLowerCase()}`], "no (b) lookup, no (c) isAdmin read");
  });

  test(`${name}: key 1, an unwrapped signature and a wrong factory call are refused`, async () => {
    const verify = createAccountSignatureVerifier(fakeGnosisClient(world()));
    const digest = hashMessage(text);
    const good = await signAsExpertSafe(OWNER, digest);
    assert.equal(await verify({ address: SAFE, message: text, signature: wrap(await signAsExpertSafe(OTHER, digest)) }), false);
    assert.equal(await verify({ address: SAFE, message: text, signature: good }), false, "no 6492 wrapper while undeployed");
    const badFactory = serializeErc6492Signature({ address: FACTORY, data: "0x1234", signature: good });
    assert.equal(await verify({ address: SAFE, message: text, signature: badFactory }), false);
    // the raw EIP-191 digest signed directly (no SafeMessage) is refused
    assert.equal(await verify({ address: SAFE, message: text, signature: wrap(await OWNER.sign({ hash: digest })) }), false);
  });
}

test("a deployed expert Safe takes the plain 65-byte ERC-1271 signature, still only rule (a)", async () => {
  const client = fakeGnosisClient(world(true));
  const verify = createAccountSignatureVerifier(client);
  const text = "hello";
  const sig = await signAsExpertSafe(OWNER, hashMessage(text));
  assert.equal(await verify({ address: SAFE, message: text, signature: sig }), true);
  assert.deepEqual(client.calls, [`verifyHash:${SAFE.toLowerCase()}`]);
});

test("typed data and a bare hash verify the same way", async () => {
  const verify = createAccountSignatureVerifier(fakeGnosisClient(world()));
  const typedData = { domain: { name: "T", version: "1", chainId: 100 }, types: { M: [{ name: "a", type: "string" }] }, primaryType: "M", message: { a: "x" } } as const;
  assert.equal(await verify({ address: SAFE, typedData, signature: wrap(await signAsExpertSafe(OWNER, hashTypedData(typedData))) }), true);
  const hash = vec.erc1271.hash as Hex;
  assert.equal(await verify({ address: SAFE, hash, signature: wrap(vec.erc1271.signature as Hex) }), true);
});

test("a thirdweb-style (c) signature by the owner over the Safe address is not accepted", async () => {
  const text = "hello";
  const inner = await OWNER.signTypedData({
    domain: { name: "Account", version: "1", chainId: 100, verifyingContract: SAFE },
    types: { AccountMessage: [{ name: "message", type: "bytes" }] },
    primaryType: "AccountMessage",
    message: { message: hashMessage(text) },
  });
  const client = fakeGnosisClient(world());
  const verify = createAccountSignatureVerifier(client);
  assert.equal(await verify({ address: SAFE, message: text, signature: wrap(inner) }), false);
  // (c) ran its isAdmin read on the Safe, which has no isAdmin: refused, not a throw
  assert.ok(client.calls.some((c) => c.startsWith("isAdmin:")));
});

test("an envelope by the expert Safe for its own address also passes (rule b, same Safe)", async () => {
  const { encodeSafeAdminSignature } = await import("../account-signature-core");
  const text = "hello";
  const env = encodeSafeAdminSignature(SAFE, wrap(await signAsExpertSafe(OWNER, hashMessage(text))));
  assert.equal(await createAccountSignatureVerifier(fakeGnosisClient(world()))({ address: SAFE, message: text, signature: env }), true);
});
