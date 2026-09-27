/**
 * The one server-side signature rule (lib/auth/account-signature-core.ts).
 * Run: cd apps/web && npx tsx --test src/lib/auth/__tests__/verify-account-signature.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  encodeAbiParameters,
  getAddress,
  hashMessage,
  hashTypedData,
  keccak256,
  serializeErc6492Signature,
  toBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  SAFE_ADMIN_SIGNATURE_MAGIC,
  decodeSafeAdminSignature,
  encodeSafeAdminSignature,
  unwrapErc6492,
} from "../account-signature-core";
import { createAccountSignatureVerifier } from "../verify-account-signature";
import { signAsPasskeySafe } from "../../passkey/__tests__/safe-1271-emulator";
import rv from "../../passkey/__tests__/recovery-vector.json";
import { fakeGnosisClient, type FakeGnosis } from "./fake-gnosis";

// Anvil/Hardhat well-known test keys - publicly known, test-only.
const ADMIN = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const STRANGER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8468f23b12de3a2baa");
/** A thirdweb Account (legacy identity) and a counterfactual one. */
/** Lowercased on purpose: the checksum as written in the notes is not valid EIP-55. */
const LEGACY = "0xc49de63ccfee46c6c5c3e393293f66779799fb28" as Hex;
const COUNTERFACTUAL = "0x1111111111111111111111111111111111111111" as Hex;
/** The passkey Safe of the fork-proven recovery vector (TEST-ONLY P-256 key). */
const g = rv.guardianApproval;
const SAFE = getAddress(g.guardianSafe) as Hex;
const OTHER_SAFE = "0x2222222222222222222222222222222222222222" as Hex;
const FACTORY = "0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00" as Hex;

const MESSAGE = "Roebel signed request v1\naction=tickets.mine\nwallet=0xc49d…\nts=1790000000";

function world(mutate?: (w: FakeGnosis) => void): FakeGnosis {
  const w: FakeGnosis = {
    thirdweb: new Map([
      [LEGACY.toLowerCase(), { admins: new Set([ADMIN.address.toLowerCase(), SAFE.toLowerCase()]), deployed: true }],
      [COUNTERFACTUAL.toLowerCase(), { admins: new Set([ADMIN.address.toLowerCase()]), deployed: false }],
    ]),
    safes: new Map([[SAFE.toLowerCase(), { x: g.guardianX as Hex, y: g.guardianY as Hex }]]),
  };
  mutate?.(w);
  return w;
}
const verifierFor = (w: FakeGnosis = world()) => {
  const client = fakeGnosisClient(w);
  return { verify: createAccountSignatureVerifier(client), client };
};

/** thirdweb smartAccountSignMessage recipe (thirdweb/src/wallets/smart/lib/signing.ts), chainId as the wallet was configured. */
function thirdwebSign(account: Hex, hash: Hex, chainId: number, signer = ADMIN) {
  return signer.signTypedData({
    domain: { chainId, name: "Account", verifyingContract: account, version: "1" },
    message: { message: encodeAbiParameters([{ type: "bytes32" }], [hash]) },
    primaryType: "AccountMessage",
    types: { AccountMessage: [{ name: "message", type: "bytes" }] },
  });
}
const safeSign = (hash: Hex) =>
  signAsPasskeySafe({
    safe: SAFE,
    privateKey: g.guardianPasskeyPrivateKey as Hex,
    x: g.guardianX as Hex,
    y: g.guardianY as Hex,
    hash,
    authenticatorData: g.authenticatorData as Hex,
  });

// =====================================================================
// envelope format
// =====================================================================

test("magic = keccak256('roebel.safe-admin-signature.v1')", () => {
  assert.equal(SAFE_ADMIN_SIGNATURE_MAGIC, keccak256(toBytes("roebel.safe-admin-signature.v1")));
});

test("envelope = magic ++ abi.encode(address safe, bytes sig), strict round trip", () => {
  const inner = safeSign(hashMessage(MESSAGE));
  const env = encodeSafeAdminSignature(SAFE, inner);
  assert.equal(
    env,
    `${SAFE_ADMIN_SIGNATURE_MAGIC}${encodeAbiParameters([{ type: "address" }, { type: "bytes" }], [SAFE, inner]).slice(2)}`,
  );
  assert.deepEqual(decodeSafeAdminSignature(env), { safe: SAFE.toLowerCase(), safeSignature: inner.toLowerCase() });
  // Not envelopes: plain signatures, wrong magic, trailing bytes, dirty padding, empty inner.
  assert.equal(decodeSafeAdminSignature(inner), null);
  assert.equal(decodeSafeAdminSignature(`0x${"00".repeat(32)}${env.slice(66)}`), null);
  assert.equal(decodeSafeAdminSignature(`${env}00`), null);
  assert.equal(decodeSafeAdminSignature(`${env.slice(0, -2)}01`), null);
  assert.equal(decodeSafeAdminSignature(encodeSafeAdminSignature(SAFE, "0x")), null);
  // A 6492 wrapper unwraps to its inner signature.
  const sig65 = `0x${"ab".repeat(65)}` as Hex;
  assert.equal(unwrapErc6492(serializeErc6492Signature({ address: FACTORY, data: "0x1234", signature: sig65 })), sig65);
  assert.equal(unwrapErc6492(sig65), sig65);
});

// =====================================================================
// regression: signatures that worked before still work
// =====================================================================

test("regression: plain EOA personal_sign", async () => {
  const { verify } = verifierFor();
  const signature = await ADMIN.signMessage({ message: MESSAGE });
  assert.equal(await verify({ address: ADMIN.address, message: MESSAGE, signature }), true);
  assert.equal(await verify({ address: STRANGER.address, message: MESSAGE, signature }), false);
  assert.equal(await verify({ address: ADMIN.address, message: `${MESSAGE}!`, signature }), false);
});

test("regression: thirdweb smart-account ERC-1271 signature, chainId 100 (deployed)", async () => {
  const { verify, client } = verifierFor();
  const signature = await thirdwebSign(LEGACY, hashMessage(MESSAGE), 100);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature }), true);
  // Passed by (a) alone: exactly the call the verifiers made before.
  assert.deepEqual(client.calls, [`verifyHash:${LEGACY.toLowerCase()}`]);
});

test("regression: thirdweb signature made with the Base chainId 8453 (pre-2026-07-27 app)", async () => {
  const { verify } = verifierFor();
  const signature = await thirdwebSign(LEGACY, hashMessage(MESSAGE), 8453);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature }), true);
  // ...but only for a current admin of the account.
  const stranger = await thirdwebSign(LEGACY, hashMessage(MESSAGE), 8453, STRANGER);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: stranger }), false);
  // ...and another chain id is not accepted.
  const other = await thirdwebSign(LEGACY, hashMessage(MESSAGE), 1);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: other }), false);
});

test("regression: counterfactual thirdweb account, ERC-6492-wrapped", async () => {
  const { verify } = verifierFor();
  const inner = await thirdwebSign(COUNTERFACTUAL, hashMessage(MESSAGE), 100);
  const signature = serializeErc6492Signature({ address: FACTORY, data: "0xd8fd8f44", signature: inner });
  assert.equal(await verify({ address: COUNTERFACTUAL, message: MESSAGE, signature }), true);
  assert.equal(await verify({ address: COUNTERFACTUAL, message: `${MESSAGE}!`, signature }), false);
});

test("typed data: thirdweb 1271 over hashTypedData", async () => {
  const { verify } = verifierFor();
  const typedData = {
    domain: { name: "Roebel", version: "1", chainId: 100 },
    types: { Login: [{ name: "wallet", type: "address" }, { name: "nonce", type: "uint256" }] },
    primaryType: "Login" as const,
    message: { wallet: LEGACY, nonce: 7n },
  };
  const signature = await thirdwebSign(LEGACY, hashTypedData(typedData), 100);
  assert.equal(await verify({ address: LEGACY, typedData, signature }), true);
  assert.equal(await verify({ address: LEGACY, typedData: { ...typedData, message: { wallet: LEGACY, nonce: 8n } }, signature }), false);
});

// =====================================================================
// (b) passkey Safe signatures
// =====================================================================

test("(b) envelope: Safe that is admin of the legacy account signs for it", async () => {
  const { verify } = verifierFor();
  const env = encodeSafeAdminSignature(SAFE, safeSign(hashMessage(MESSAGE)));
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: env }), true);
  assert.equal(await verify({ address: LEGACY, message: `${MESSAGE}!`, signature: env }), false);
});

test("(b) envelope: refused when the Safe is not an admin, or the account is an EOA", async () => {
  const env = encodeSafeAdminSignature(SAFE, safeSign(hashMessage(MESSAGE)));
  const notAdmin = verifierFor(world((w) => w.thirdweb.get(LEGACY.toLowerCase())!.admins.delete(SAFE.toLowerCase())));
  assert.equal(await notAdmin.verify({ address: LEGACY, message: MESSAGE, signature: env }), false);
  // The Safe signature itself is never checked for a non-admin claim.
  assert.equal(notAdmin.client.calls.some((c) => c.startsWith("verifyHash")), false);
  const { verify } = verifierFor();
  assert.equal(await verify({ address: STRANGER.address, message: MESSAGE, signature: env }), false);
});

test("(b) envelope naming a Safe that did not sign (or signed something else)", async () => {
  const { verify } = verifierFor(world((w) => w.thirdweb.get(LEGACY.toLowerCase())!.admins.add(OTHER_SAFE.toLowerCase())));
  const inner = safeSign(hashMessage(MESSAGE));
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: encodeSafeAdminSignature(OTHER_SAFE, inner) }), false);
  const wrong = encodeSafeAdminSignature(SAFE, safeSign(hashMessage("something else")));
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: wrong }), false);
});

test("passkey-only identity (address = the Safe): raw Safe signature via (a), envelope via (b)", async () => {
  const { verify } = verifierFor();
  const inner = safeSign(hashMessage(MESSAGE));
  assert.equal(await verify({ address: SAFE, message: MESSAGE, signature: inner }), true);
  assert.equal(await verify({ address: SAFE, message: MESSAGE, signature: encodeSafeAdminSignature(SAFE, inner) }), true);
});

test("a thirdweb admin signature cannot be passed off as an envelope for another account", async () => {
  const { verify } = verifierFor();
  const tw = await thirdwebSign(LEGACY, hashMessage(MESSAGE), 100);
  // Envelope claiming LEGACY (a thirdweb account, not a Safe) administers STRANGER's EOA.
  assert.equal(await verify({ address: STRANGER.address, message: MESSAGE, signature: encodeSafeAdminSignature(LEGACY, tw) }), false);
});

// =====================================================================
// errors
// =====================================================================

test("transport failures throw (callers map them to 503 / their own code)", async () => {
  const { verify } = verifierFor(world((w) => (w.down = true)));
  const tw = await thirdwebSign(LEGACY, hashMessage(MESSAGE), 100);
  await assert.rejects(verify({ address: LEGACY, message: MESSAGE, signature: tw }));
  const env = encodeSafeAdminSignature(SAFE, safeSign(hashMessage(MESSAGE)));
  await assert.rejects(verify({ address: LEGACY, message: MESSAGE, signature: env }));
});

test("malformed input is false, never a throw", async () => {
  const { verify } = verifierFor();
  // A bad EIP-55 checksum is not an error: the address is lowercased first.
  const tw = await thirdwebSign(LEGACY, hashMessage(MESSAGE), 100);
  assert.equal(await verify({ address: "0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28", message: MESSAGE, signature: tw }), true);
  assert.equal(await verify({ address: "not-an-address", message: MESSAGE, signature: "0x1234" }), false);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: "0x" }), false);
  assert.equal(await verify({ address: LEGACY, message: MESSAGE, signature: "hello" }), false);
  assert.equal(await verify({ address: LEGACY, hash: "0x1234", signature: "0x1234" }), false);
  await assert.rejects(verify({ address: LEGACY, signature: "0x1234" }));
});

// =====================================================================
// the edge function copy
// =====================================================================

test("the Deno copy (_shared/verify-account-signature.ts) is byte-identical to the web core", () => {
  const web = readFileSync(join(process.cwd(), "src/lib/auth/account-signature-core.ts"), "utf8");
  const edge = readFileSync(join(process.cwd(), "../expo/supabase/functions/_shared/verify-account-signature.ts"), "utf8");
  assert.equal(edge, web);
});
