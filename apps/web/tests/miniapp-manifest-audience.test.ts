// apps/web/tests/miniapp-manifest-audience.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { manifestStoreFields, missingNewColumns, validateManifest, withoutIdentityColumns } from "../src/lib/miniapp/manifest";

const v1 = {
  slug: "verein",
  name: "Verein",
  homeUrl: "https://verein.example.app/",
  description: "Für den Verein.",
  category: "community",
};
const v2 = { ...v1, version: "2" };
const ORG = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const TYPE = "type:0x" + "ab".repeat(32);

test("an audience is normalised", () => {
  const m = validateManifest({
    ...v2,
    audience: { mode: "required", anyOf: ["citizen", "org:3F2504E0-4F89-41D3-9A0C-0305E82C3301"] },
    org: "3F2504E0-4F89-41D3-9A0C-0305E82C3301",
  });
  assert.deepEqual(m.audience, { mode: "required", anyOf: ["citizen", `org:${ORG}`] });
  assert.equal(m.org, ORG);
});

test("type references are lowercased", () => {
  const m = validateManifest({ ...v2, audience: { mode: "recommended", anyOf: [TYPE.toUpperCase().replace("TYPE:0X", "type:0x")] } });
  assert.deepEqual(m.audience, { mode: "recommended", anyOf: [TYPE] });
});

test("mode must be required or recommended", () => {
  for (const mode of ["optional", "", undefined, 1]) {
    assert.throws(() => validateManifest({ ...v2, audience: { mode, anyOf: ["citizen"] } }), /audience\.mode/);
  }
  assert.throws(() => validateManifest({ ...v2, audience: "citizen" }), /audience/);
  assert.throws(() => validateManifest({ ...v2, audience: { mode: "required", anyOf: ["citizen"], extra: 1 } }), /audience\.extra/);
});

test("anyOf needs 1 to 8 valid, distinct references", () => {
  const nine = Array.from({ length: 9 }, (_, i) => `type:0x${String(i).repeat(64)}`);
  for (const anyOf of [[], nine, ["Bürger"], ["citizen", "citizen"], [`org:${ORG}`, `org:${ORG.toUpperCase()}`], "citizen", [5]]) {
    assert.throws(() => validateManifest({ ...v2, audience: { mode: "required", anyOf } }), /audience\.anyOf/);
  }
  const eight = nine.slice(0, 8);
  assert.equal(validateManifest({ ...v2, audience: { mode: "required", anyOf: eight } }).audience?.anyOf.length, 8);
});

test("org must be a uuid", () => {
  for (const org of ["psv", "", `org:${ORG}`, 42, ORG + "0"]) {
    assert.throws(() => validateManifest({ ...v2, org }), /org/);
  }
});

test("version 1 must not carry audience or org", () => {
  assert.throws(() => validateManifest({ ...v1, audience: { mode: "required", anyOf: ["citizen"] } }), /audience.*version "2"/);
  assert.throws(() => validateManifest({ ...v1, org: ORG }), /org.*version "2"/);
});

test("a version 1 manifest gains no new keys", () => {
  const m = validateManifest(v1);
  assert.ok(!("audience" in m));
  assert.ok(!("org" in m));
  assert.ok(!("version" in m));
});

test("manifestStoreFields maps audience and org_account_id, null when absent", () => {
  const withBoth = manifestStoreFields(
    validateManifest({ ...v2, audience: { mode: "recommended", anyOf: ["guest"] }, org: ORG }),
  );
  assert.deepEqual(withBoth.audience, { mode: "recommended", anyOf: ["guest"] });
  assert.equal(withBoth.org_account_id, ORG);
  const none = manifestStoreFields(validateManifest(v2));
  assert.equal(none.audience, null);
  assert.equal(none.org_account_id, null);
  const old = manifestStoreFields(validateManifest(v1));
  assert.equal(old.audience, null);
  assert.equal(old.org_account_id, null);
});

test("a missing audience column drops only the audience columns", () => {
  const drop = missingNewColumns({ code: "PGRST204", message: "Could not find the 'org_account_id' column of 'mini_apps'" });
  assert.deepEqual(drop.sort(), ["audience", "org_account_id"]);
  const drop2 = missingNewColumns({ code: "42703", message: 'column "audience" of relation "mini_apps" does not exist' });
  assert.deepEqual(drop2.sort(), ["audience", "org_account_id"]);
});

test("a missing identity column drops every new column, the audience ones too", () => {
  const drop = missingNewColumns({ code: "PGRST204", message: "Could not find the 'identity' column" });
  assert.ok(drop.includes("audience") && drop.includes("org_account_id") && drop.includes("contracts"));
  const p = withoutIdentityColumns({ name: "x", identity: null, audience: null, org_account_id: null, contracts: [] });
  assert.deepEqual(p, { name: "x" });
});
