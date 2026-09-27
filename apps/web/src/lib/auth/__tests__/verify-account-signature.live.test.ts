/**
 * LIVE Gnosis checks of verifyAccountSignature (skipped unless PASSKEY_LIVE_TEST=1).
 * Run: cd apps/web && PASSKEY_LIVE_TEST=1 npx tsx --test src/lib/auth/__tests__/verify-account-signature.live.test.ts
 *
 * Live example (2026-09-27): legacy thirdweb account 0xc49d…Fb28 is administered by the passkey
 * Safe 0xe3d1…2deb. Without the passkey we cannot make a real Safe signature, so this checks the
 * chain half of rule (b) (isAdmin true -> the Safe's ERC-1271 is asked and says no) and that
 * garbage never throws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, hashMessage, http, parseAbi, type Hex } from "viem";
import { gnosis } from "viem/chains";
import { createAccountSignatureVerifier, encodeSafeAdminSignature } from "../verify-account-signature";

const live = process.env.PASSKEY_LIVE_TEST === "1";
const LEGACY = "0xc49de63ccfee46c6c5c3e393293f66779799fb28" as Hex;
const SAFE = "0xe3d18fecdcf8e8b656b11340790f7c0147632deb" as Hex;
const client = createPublicClient({
  chain: gnosis,
  transport: http(process.env.GNOSIS_RPC_URL || "https://gnosis-rpc.publicnode.com", { timeout: 15_000 }),
});
const verify = createAccountSignatureVerifier(client);
const MESSAGE = "live check";

test("live: the passkey Safe is an admin of the legacy account", { skip: !live }, async () => {
  const isAdmin = await client.readContract({
    address: LEGACY,
    abi: parseAbi(["function isAdmin(address) view returns (bool)"]),
    functionName: "isAdmin",
    args: [SAFE],
  });
  assert.equal(isAdmin, true);
});

test("live: an envelope from the admin Safe with a bogus inner signature is false (not a throw)", { skip: !live }, async () => {
  const env = encodeSafeAdminSignature(SAFE, `0x${"ab".repeat(65)}`);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: env }), false);
});

test("live: an envelope naming a non-admin Safe is false", { skip: !live }, async () => {
  const env = encodeSafeAdminSignature("0x2222222222222222222222222222222222222222", `0x${"ab".repeat(65)}`);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: env }), false);
});

test("live: a random 65-byte signature for the thirdweb account is false via (a) and (c)", { skip: !live }, async () => {
  assert.equal(await verify({ address: LEGACY, hash: hashMessage(MESSAGE), signature: `0x${"cd".repeat(64)}1b` }), false);
});
