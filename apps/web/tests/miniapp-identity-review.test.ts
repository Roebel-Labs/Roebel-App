// apps/web/tests/miniapp-identity-review.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identityReviewItems,
  identityFromManifest,
  needsIdentityReview,
  previewCredentials,
  previewWalletOverrides,
} from "../src/lib/miniapp/identityReview";

const T = "type:0x" + "ab".repeat(32);

test("new items are marked against the live version", () => {
  const items = identityReviewItems(
    { profile: true, address: false, credentials: [] },
    { profile: true, address: true, credentials: [{ type: "citizen", reason: "r" }] },
  );
  assert.deepEqual(items.map((i) => [i.key, i.isNew]), [["profile", false], ["address", true], ["cred:citizen", true]]);
});

test("labels, reasons and sensitivity", () => {
  const items = identityReviewItems(null, {
    profile: true,
    address: true,
    credentials: [{ type: "attester", reason: "Nur Prüfer:innen" }, { type: T, reason: "Mitglied" }],
  });
  assert.deepEqual(
    items.map((i) => [i.label, i.reason, i.sensitive, i.isNew]),
    [
      ["Name und Bild", undefined, false, true],
      ["Kontoadresse", undefined, true, true],
      ["Bescheiniger:in", "Nur Prüfer:innen", true, true],
      [`${T} (unbekannter Typ)`, "Mitglied", true, true],
    ],
  );
});

test("a describe lookup names register types", () => {
  const items = identityReviewItems(undefined, { profile: false, address: false, credentials: [{ type: T, reason: "r" }] }, (ref) => (ref === T ? "Feuerwehr" : null));
  assert.equal(items[0].label, "Feuerwehr");
});

test("nothing requested gives no items", () => {
  assert.deepEqual(identityReviewItems(null, null), []);
});

test("profile alone needs no explicit confirmation", () => assert.equal(needsIdentityReview({ profile: true, address: false, credentials: [] }), false));

test("address or any credential does", () => {
  assert.equal(needsIdentityReview({ profile: false, address: true, credentials: [] }), true);
  assert.equal(needsIdentityReview({ profile: false, address: false, credentials: [{ type: "guest", reason: "r" }] }), true);
  assert.equal(needsIdentityReview(null), false);
  assert.equal(needsIdentityReview(undefined), false);
});

test("identityFromManifest reads a stored version manifest, wrapped or flat", () => {
  const identity = { profile: true, credentials: [{ type: "citizen", reason: "r" }] };
  assert.deepEqual(identityFromManifest({ miniapp: { version: "2", identity } }), identity);
  assert.deepEqual(identityFromManifest({ version: "2", identity }), identity);
  assert.equal(identityFromManifest({ miniapp: { name: "x" } }), null);
  assert.equal(identityFromManifest(null), null);
  assert.equal(identityFromManifest({ identity: "nope" }), null);
});

test("the reviewer preview only shows toggled types the manifest requests", () => {
  const identity = { profile: false, address: false, credentials: [{ type: "citizen", reason: "r" }] };
  assert.deepEqual(previewCredentials(identity, { citizen: true, attester: true }).map((c) => c.type), ["citizen"]);
  assert.deepEqual(previewCredentials(identity, { citizen: false, attester: true }), []);
  const c = previewCredentials(identity, { citizen: true, attester: false })[0];
  assert.deepEqual(c, { type: "citizen", kind: "builtin", name: "Bürger:in", validUntil: null, recognised: true });
});

test("the Playground hides the wallet when the address is not shared", async () => {
  const o = previewWalletOverrides(false);
  assert.equal(await o.walletGetAccount?.(), null);
  await assert.rejects(Promise.resolve().then(() => o.walletRequest?.({ method: "eth_accounts" })), (e: { code?: string }) => e.code === "unauthorized");
});

test("the Playground keeps the real wallet handlers when the address is shared", () => {
  assert.deepEqual(previewWalletOverrides(true), {});
});
