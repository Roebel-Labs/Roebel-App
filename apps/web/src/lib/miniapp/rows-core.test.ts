import { test } from "node:test";
import assert from "node:assert/strict";
import { canRemove, canSee, canUpdate, checkCollection, checkKey, checkPayload, clampLimit, likePrefix, toApiRow, type DbRow } from "./rows-core";

const A = "0x" + "a".repeat(40);
const B = "0x" + "b".repeat(40);
const row: DbRow = { id: "r1", owner_wallet: A, key: "raum1|2026-12-01|14", data: { raum: "raum1" }, private_data: { name: "Lea" }, created_at: "t", updated_at: "t" };

test("validation", () => {
  assert.equal(checkCollection("buchungen"), null);
  assert.ok(checkCollection("Buchungen"));
  assert.ok(checkCollection("a".repeat(41)));
  assert.equal(checkKey(undefined), null);
  assert.equal(checkKey("raum1|2026-12-01|14:00"), null);
  assert.ok(checkKey("mit leerzeichen"));
  assert.ok(checkKey(""));
  assert.equal(checkPayload({ a: 1 }, { b: 2 }, true), null);
  assert.ok(checkPayload(undefined, undefined, true));
  assert.ok(checkPayload([1], undefined, false));
  assert.ok(checkPayload({ big: "x".repeat(9000) }, undefined, true));
  assert.equal(clampLimit(undefined), 100);
  assert.equal(clampLimit(5000), 200);
  assert.equal(clampLimit(0), 1);
  assert.equal(likePrefix("a_b%|"), "a\\_b\\%|%");
});

test("shared rows: everyone sees data, private data only author and app owner, never the wallet", () => {
  const other = toApiRow("shared", row, { wallet: B, appOwner: false });
  assert.equal(other.mine, false);
  assert.equal("privateData" in other, false);
  assert.equal(JSON.stringify(other).includes(A), false);
  assert.deepEqual(toApiRow("shared", row, { wallet: A, appOwner: false }).privateData, { name: "Lea" });
  assert.deepEqual(toApiRow("shared", row, { wallet: null, appOwner: true }).privateData, { name: "Lea" });
});

test("private rows: only the author sees them; the app owner does not", () => {
  assert.equal(canSee("private", row, { wallet: A, appOwner: false }), true);
  assert.equal(canSee("private", row, { wallet: B, appOwner: true }), false);
  assert.equal(canSee("shared", row, { wallet: null, appOwner: false }), true);
});

test("update only by the author; remove by author or app owner for shared rows", () => {
  assert.equal(canUpdate(row, { wallet: A, appOwner: false }), true);
  assert.equal(canUpdate(row, { wallet: B, appOwner: true }), false);
  assert.equal(canRemove("shared", row, { wallet: B, appOwner: true }), true);
  assert.equal(canRemove("private", row, { wallet: B, appOwner: true }), false);
  assert.equal(canRemove("shared", row, { wallet: B, appOwner: false }), false);
});
