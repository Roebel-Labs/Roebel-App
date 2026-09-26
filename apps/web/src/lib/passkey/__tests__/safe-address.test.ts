/**
 * Golden vector: the web port must derive the passkey Safe exactly like the
 * fork proof (contracts/passkey-accounts/test/fixtures/passkey-safe-vector.json).
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/safe-address.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { concatHex, keccak256, stringToHex, type Hex } from "viem";
import vector from "./passkey-safe-vector.json";
import {
  FALLBACK_HANDLER_SLOT,
  SAFE_PROXY_CREATION_CODE,
  PASSKEY_SAFE,
  SAFE_PROXY_RUNTIME_CODE,
  WEBAUTHN_VERIFIERS,
  buildSafeSetup,
  predictSafeAddress,
  safeFactoryData,
} from "../safe-address";

const key = { x: vector.x as Hex, y: vector.y as Hex };

test("verifiers packing matches the fork proof", () => {
  assert.equal(`0x${WEBAUTHN_VERIFIERS.toString(16).padStart(44, "0")}`, vector.verifiers);
});

test("Safe.setup initializer is byte-identical", () => {
  const { initializer, saltNonce } = buildSafeSetup(key);
  assert.equal(initializer, vector.setupData);
  assert.equal(saltNonce, BigInt(vector.saltNonce));
});

test("predicts the golden Safe address", () => {
  assert.equal(predictSafeAddress(key), vector.safeAddress);
});

test("factory ++ factoryData is the golden initCode", () => {
  assert.equal(concatHex([PASSKEY_SAFE.proxyFactory, safeFactoryData(key)]).toLowerCase(), vector.initCode);
});

test("fallback handler slot is keccak256('fallback_manager.handler.address')", () => {
  assert.equal(FALLBACK_HANDLER_SLOT, keccak256(stringToHex("fallback_manager.handler.address")));
});

test("proxy runtime code is the runtime embedded in SafeProxyFactory 1.4.1 proxyCreationCode", () => {
  // Verified 2026-09-26 with `cast code` on a live Safe 1.4.1 proxy on Gnosis.
  assert.equal(SAFE_PROXY_RUNTIME_CODE.length, 2 + 171 * 2);
  assert.ok(SAFE_PROXY_CREATION_CODE.includes(SAFE_PROXY_RUNTIME_CODE.slice(2)));
  assert.ok(SAFE_PROXY_RUNTIME_CODE.startsWith("0x608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e"));
});
