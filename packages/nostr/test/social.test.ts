import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToBytes } from "@noble/hashes/utils";
import { buildContactListEvent, buildPrivateListEvent, readPrivateItems, KIND_MUTE_LIST, KIND_FOLLOW_SET, NETIZEN_ACCOUNT_TAG, UNFOLLOWED_SET_D } from "../src/social";
import { verifyEvent } from "../src/events";

const sk = hexToBytes("0000000000000000000000000000000000000000000000000000000000000003");
const ORG = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

test("contact list is kind 3 with one p tag per pubkey, deduped", () => {
  const e = buildContactListEvent(sk, [ORG, ORG], { createdAt: 1700000000 });
  assert.equal(e.kind, 3);
  assert.deepEqual(e.tags, [["p", ORG]]);
  assert.ok(verifyEvent(e));
});

test("private lists carry NO public tags and decrypt back to the items", () => {
  const items = [["p", ORG], [NETIZEN_ACCOUNT_TAG, "11111111-1111-4111-8111-111111111111"]];
  const mute = buildPrivateListEvent(sk, KIND_MUTE_LIST, items, { createdAt: 1700000000 });
  assert.equal(mute.kind, 10000);
  assert.deepEqual(mute.tags, []);
  assert.ok(!mute.content.includes("1111"), "content must be encrypted");
  assert.deepEqual(readPrivateItems(sk, mute), items);

  const set = buildPrivateListEvent(sk, KIND_FOLLOW_SET, [[NETIZEN_ACCOUNT_TAG, "x"]], { d: UNFOLLOWED_SET_D });
  assert.deepEqual(set.tags, [["d", UNFOLLOWED_SET_D]]);
});

test("an empty private list still publishes (clears the replaceable list)", () => {
  const e = buildPrivateListEvent(sk, KIND_MUTE_LIST, []);
  assert.deepEqual(readPrivateItems(sk, e), []);
});
