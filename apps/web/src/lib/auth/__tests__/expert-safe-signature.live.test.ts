/**
 * LIVE Gnosis proof (skipped unless PASSKEY_LIVE_TEST=1) that every signature endpoint's verifier accepts the
 * counterfactual expert-path Safe (ECDSA owner, ERC-6492), spec 5.7.
 * Run: cd apps/web && PASSKEY_LIVE_TEST=1 npx tsx --test src/lib/auth/__tests__/expert-safe-signature.live.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, hashMessage, http, serializeErc6492Signature, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import { createAccountSignatureVerifier } from "../verify-account-signature";
import { safeMessageHash } from "../../passkey/__tests__/safe-1271-emulator";
import { PASSKEY_SAFE, ecdsaSafeFactoryData, predictEcdsaSafeAddress } from "../../passkey/safe-address";
import { buildExpertTexts } from "./expert-safe-texts";

const live = process.env.PASSKEY_LIVE_TEST === "1";
const OWNER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const OTHER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8468f23b12de3a2baa");
const SAFE = predictEcdsaSafeAddress(OWNER.address) as Hex;
const client = createPublicClient({
  chain: gnosis,
  transport: http(process.env.GNOSIS_RPC_URL || "https://gnosis-rpc.publicnode.com", { timeout: 20_000 }),
});
const verify = createAccountSignatureVerifier(client);
const sign = (key: typeof OWNER, text: string) => key.sign({ hash: safeMessageHash(SAFE, hashMessage(text)) });
const wrap = (signature: Hex) =>
  serializeErc6492Signature({ address: PASSKEY_SAFE.proxyFactory as Hex, data: ecdsaSafeFactoryData(OWNER.address), signature });

test("live: the expert Safe is still counterfactual (the premise of these tests)", { skip: !live }, async () => {
  assert.equal(await client.getCode({ address: SAFE }), undefined);
});

for (const [name, text] of Object.entries(buildExpertTexts(SAFE))) {
  test(`live: ${name}`, { skip: !live, timeout: 60_000 }, async () => {
    assert.equal(await verify({ address: SAFE, message: text, signature: wrap(await sign(OWNER, text)) }), true);
    assert.equal(await verify({ address: SAFE, message: text, signature: wrap(await sign(OTHER, text)) }), false);
    // a plain 65-byte signature without the 6492 wrapper cannot verify an undeployed Safe
    assert.equal(await verify({ address: SAFE, message: text, signature: await sign(OWNER, text) }), false);
  });
}
