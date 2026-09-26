import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORG_TAG,
  orgIdFromUuid,
  orgIdOfEvent,
  orgRoleFromIndex,
  pubkeyToBytes32,
  safeParseOrgMetadata,
  verifyOrgEvent,
} from "../src/orgs.js";
import { safeParseManifest } from "../src/manifest.js";
import roebel from "../examples/roebel.netizen.json" with { type: "json" };

const UUID = "6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10";
// Pinned vector: ethers.id("netizen:org:v1:" + UUID) — the same id the
// OrgRegistry tests mint. If this moves, every org has been re-keyed.
const ORG = "0xe24e97d03b0d38722d695a9ad8cb4f4c87d82908a322b08d510acaef2bb629f3";
const PK = "b".repeat(64);

test("orgIdFromUuid is the frozen keccak derivation, case-insensitive", () => {
  assert.equal(orgIdFromUuid(UUID), ORG);
  assert.equal(orgIdFromUuid(UUID.toUpperCase()), ORG);
  assert.throws(() => orgIdFromUuid("not-a-uuid"));
});

test("role indices align with OrgRegistry.Role", () => {
  assert.equal(orgRoleFromIndex(0), "none");
  assert.equal(orgRoleFromIndex(1n), "member");
  assert.equal(orgRoleFromIndex(2), "admin");
  assert.throws(() => orgRoleFromIndex(3));
});

test("orgIdOfEvent reads the netizen_org tag and rejects malformed ids", () => {
  assert.equal(orgIdOfEvent({ pubkey: PK, tags: [[ORG_TAG, ORG.toUpperCase().replace("0X", "0x")]] }), ORG);
  assert.equal(orgIdOfEvent({ pubkey: PK, tags: [[ORG_TAG, "0x1234"]] }), null);
  assert.equal(orgIdOfEvent({ pubkey: PK, tags: [] }), null);
});

test("verifyOrgEvent accepts only keys the registry authorises for that org", async () => {
  const seen: string[] = [];
  const lookup = async (orgId: string, pk: string) => {
    seen.push(`${orgId}:${pk}`);
    return orgId === ORG && pk === PK;
  };
  assert.deepEqual(await verifyOrgEvent({ pubkey: PK, tags: [[ORG_TAG, ORG]] }, lookup), { ok: true, orgId: ORG });
  assert.deepEqual(await verifyOrgEvent({ pubkey: "c".repeat(64), tags: [[ORG_TAG, ORG]] }, lookup), {
    ok: false,
    reason: "key_not_authorized",
  });
  assert.deepEqual(await verifyOrgEvent({ pubkey: PK, tags: [] }, lookup), { ok: false, reason: "no_org_tag" });
  assert.deepEqual(await verifyOrgEvent({ pubkey: "zz", tags: [[ORG_TAG, ORG]] }, lookup), {
    ok: false,
    reason: "bad_pubkey",
  });
  assert.equal(seen.length, 2); // no lookup for malformed events
});

test("pubkeyToBytes32 prefixes x-only keys and refuses anything else", () => {
  assert.equal(pubkeyToBytes32(PK.toUpperCase()), `0x${PK}`);
  assert.throws(() => pubkeyToBytes32("02" + PK));
});

test("org metadata: public fields only, unknown org types pass", () => {
  const ok = safeParseOrgMetadata({ nsp: 14, version: 1, orgId: ORG, name: "Kino am Markt", type: "kino" });
  assert.equal(ok.success, true);
  assert.equal(safeParseOrgMetadata({ nsp: 14, version: 1, orgId: "0x12", name: "x", type: "verein" }).success, false);
  assert.equal(safeParseOrgMetadata({ nsp: 13, version: 1, orgId: ORG, name: "x", type: "verein" }).success, false);
});

test("manifest accepts an optional contracts.orgRegistry", () => {
  const base = structuredClone(roebel) as { contracts?: Record<string, string> };
  if (!base.contracts) return;
  base.contracts.orgRegistry = "0x" + "1".repeat(40);
  assert.equal(safeParseManifest(base).success, true);
  base.contracts.orgRegistry = "nope";
  assert.equal(safeParseManifest(base).success, false);
});
