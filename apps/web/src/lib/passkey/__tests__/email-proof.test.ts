/**
 * Proof message + offline ERC-1271 check for the optional passkey email.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/email-proof.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, hashMessage, type Hex } from "viem";
import {
  PROOF_MAX_SKEW_SEC,
  buildEmailProofMessage,
  isProofFresh,
  normalizeEmail,
} from "../email-proof";
import { emulateSafeIsValidSignature, safeMessageHash, signAsPasskeySafe } from "./safe-1271-emulator";
import rv from "./recovery-vector.json";
import vector from "./email-proof-vector.json";

const g = rv.guardianApproval;
const SAFE = getAddress(g.guardianSafe);

test("the emulator accepts the fork-proven guardian signature (so it matches the chain)", () => {
  assert.equal(safeMessageHash(SAFE, g.recoveryHash as Hex), g.safeMessageHash);
  assert.equal(
    emulateSafeIsValidSignature({ safe: SAFE, x: g.guardianX as Hex, y: g.guardianY as Hex, hash: g.recoveryHash as Hex, signature: g.guardianSignature as Hex }),
    true,
  );
  // Same signature, other hash / other Safe: rejected.
  assert.equal(
    emulateSafeIsValidSignature({ safe: SAFE, x: g.guardianX as Hex, y: g.guardianY as Hex, hash: `0x${"11".repeat(32)}`, signature: g.guardianSignature as Hex }),
    false,
  );
  assert.equal(
    emulateSafeIsValidSignature({ safe: getAddress(rv.newSafe), x: g.guardianX as Hex, y: g.guardianY as Hex, hash: g.recoveryHash as Hex, signature: g.guardianSignature as Hex }),
    false,
  );
});

test("normalizeEmail trims, lowercases and rejects junk", () => {
  assert.equal(normalizeEmail("  Max.Muster@Example.DE "), "max.muster@example.de");
  for (const bad of ["", "a", "a@b", "a b@c.de", "@c.de", "a@.de", `${"a".repeat(250)}@c.de`, 5, null, "a@b.de\nx@y.de"]) {
    assert.equal(normalizeEmail(bad as unknown), null, String(bad));
  }
});

test("proof messages are fixed text (shared byte-exact with apps/expo/lib/passkey/email.ts)", () => {
  const add = buildEmailProofMessage({ action: "add", safe: vector.safe as Hex, email: vector.email, timestamp: vector.timestamp });
  const remove = buildEmailProofMessage({ action: "remove", safe: vector.safe as Hex, timestamp: vector.timestamp });
  assert.equal(add, vector.addMessage);
  assert.equal(remove, vector.removeMessage);
  assert.equal(hashMessage(add), vector.addMessageHash);
  assert.equal(safeMessageHash(getAddress(vector.safe), hashMessage(add)), vector.addChallenge);
  // The Safe is lowercased in the text so the checksum casing of the request never matters.
  assert.equal(
    buildEmailProofMessage({ action: "add", safe: getAddress(vector.safe), email: vector.email, timestamp: vector.timestamp }),
    add,
  );
});

test("freshness window is ±10 minutes", () => {
  assert.equal(PROOF_MAX_SKEW_SEC, 600);
  const now = 1_790_000_000;
  assert.equal(isProofFresh(now, now), true);
  assert.equal(isProofFresh(now - 600, now), true);
  assert.equal(isProofFresh(now + 600, now), true);
  assert.equal(isProofFresh(now - 601, now), false);
  assert.equal(isProofFresh(now + 601, now), false);
  assert.equal(isProofFresh(1.5, now), false);
});

test("a real passkey-Safe proof over the add message verifies; a different email does not", () => {
  const ts = 1_790_000_000;
  const msg = buildEmailProofMessage({ action: "add", safe: SAFE, email: "max@example.de", timestamp: ts });
  const signature = signAsPasskeySafe({
    safe: SAFE,
    privateKey: g.guardianPasskeyPrivateKey as Hex,
    x: g.guardianX as Hex,
    y: g.guardianY as Hex,
    hash: hashMessage(msg),
    authenticatorData: g.authenticatorData as Hex,
  });
  const check = (m: string) =>
    emulateSafeIsValidSignature({ safe: SAFE, x: g.guardianX as Hex, y: g.guardianY as Hex, hash: hashMessage(m), signature });
  assert.equal(check(msg), true);
  assert.equal(check(buildEmailProofMessage({ action: "add", safe: SAFE, email: "evil@example.de", timestamp: ts })), false);
  assert.equal(check(buildEmailProofMessage({ action: "remove", safe: SAFE, timestamp: ts })), false);
});
