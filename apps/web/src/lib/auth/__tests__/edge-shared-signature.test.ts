/**
 * Runs the Deno edge copy (apps/expo/supabase/functions/_shared/verify-account-signature.ts)
 * directly under Node: it imports nothing, so the same file the edge functions load is tested here
 * (deno is not installed in this environment).
 * Run: cd apps/web && npx tsx --test src/lib/auth/__tests__/edge-shared-signature.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, getAddress, hashMessage, hashTypedData, recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  encodeSafeAdminSignature,
  makeAccountSignatureVerifier,
} from "../../../../../expo/supabase/functions/_shared/verify-account-signature";
import { signAsPasskeySafe } from "../../passkey/__tests__/safe-1271-emulator";
import rv from "../../passkey/__tests__/recovery-vector.json";
import { fakeGnosisClient } from "./fake-gnosis";

const ADMIN = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const LEGACY = "0xc49de63ccfee46c6c5c3e393293f66779799fb28" as Hex;
const g = rv.guardianApproval;
const SAFE = getAddress(g.guardianSafe) as Hex;
const MESSAGE = "Delete my Röbel account\nwallet=0xc49d…\nissuedAt=2026-09-27T10:00:00Z";

const verify = makeAccountSignatureVerifier({
  client: fakeGnosisClient({
    thirdweb: new Map([[LEGACY, { admins: new Set([ADMIN.address.toLowerCase(), SAFE.toLowerCase()]), deployed: true }]]),
    safes: new Map([[SAFE.toLowerCase(), { x: g.guardianX as Hex, y: g.guardianY as Hex }]]),
  }),
  utils: { hashMessage, hashTypedData, recoverTypedDataAddress },
});

const thirdweb = (chainId: number) =>
  ADMIN.signTypedData({
    domain: { chainId, name: "Account", verifyingContract: LEGACY, version: "1" },
    message: { message: encodeAbiParameters([{ type: "bytes32" }], [hashMessage(MESSAGE)]) },
    primaryType: "AccountMessage",
    types: { AccountMessage: [{ name: "message", type: "bytes" }] },
  });

test("edge copy: EOA, thirdweb chainId 100 and 8453, passkey-Safe envelope", async () => {
  assert.equal(await verify({ address: ADMIN.address, message: MESSAGE, signature: await ADMIN.signMessage({ message: MESSAGE }) }), true);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: await thirdweb(100) }), true);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: await thirdweb(8453) }), true);
  const inner = signAsPasskeySafe({
    safe: SAFE,
    privateKey: g.guardianPasskeyPrivateKey as Hex,
    x: g.guardianX as Hex,
    y: g.guardianY as Hex,
    hash: hashMessage(MESSAGE),
    authenticatorData: g.authenticatorData as Hex,
  });
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: encodeSafeAdminSignature(SAFE, inner) }), true);
  assert.equal(await verify({ address: LEGACY, message: `${MESSAGE}.`, signature: encodeSafeAdminSignature(SAFE, inner) }), false);
});
