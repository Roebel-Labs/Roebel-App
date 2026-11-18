// apps/web/tests/miniapp-manifest-identity.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { MANIFEST_VERSIONS, manifestStoreFields, validateManifest } from "../src/lib/miniapp/manifest";

const base = {
  slug: "abstimmung",
  name: "Abstimmung",
  homeUrl: "https://abstimmung.example.app/",
  description: "Stimm ab.",
  category: "governance",
};
const ORG = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const cred = (type: string, reason = "Grund") => ({ type, reason });

test("manifest versions are 1 and 2", () => assert.deepEqual(MANIFEST_VERSIONS, ["1", "2"]));

test("version 2 with identity is normalised", () => {
  const m = validateManifest({
    ...base,
    version: "2",
    identity: { address: true, credentials: [{ type: "citizen", reason: " Nur Bürger:innen stimmen ab. " }] },
  });
  assert.deepEqual(m.identity, {
    profile: false,
    address: true,
    credentials: [{ type: "citizen", reason: "Nur Bürger:innen stimmen ab." }],
  });
  assert.equal(m.version, "2");
});

test("version 2 lowercases credential references", () => {
  const m = validateManifest({
    ...base,
    version: "2",
    identity: { credentials: [cred("org:" + ORG.toUpperCase()), cred("type:0x" + "AB".repeat(32))] },
  });
  assert.deepEqual(
    m.identity?.credentials.map((c) => c.type),
    ["org:" + ORG, "type:0x" + "ab".repeat(32)],
  );
});

test("version 2 without identity is valid and carries none", () => {
  const m = validateManifest({ ...base, version: "2" });
  assert.equal(m.version, "2");
  assert.equal(m.identity, undefined);
});

test("version 1 output is unchanged (no version or identity keys)", () => {
  const implicit = validateManifest(base);
  const explicit = validateManifest({ ...base, version: "1" });
  assert.deepEqual(implicit, explicit);
  assert.equal("version" in implicit, false);
  assert.equal("identity" in implicit, false);
});

test("version 1 must not carry identity", () =>
  assert.throws(() => validateManifest({ ...base, identity: { profile: true } }), /version "2"/));

test("an unknown manifest version is refused", () =>
  assert.throws(() => validateManifest({ ...base, version: "3" }), /version/));

test("a credential needs a reason of 1 to 120 characters", () => {
  const v2 = (reason: string) => validateManifest({ ...base, version: "2", identity: { credentials: [cred("citizen", reason)] } });
  assert.throws(() => v2(""), /reason/);
  assert.throws(() => v2("   "), /reason/);
  assert.throws(() => v2("x".repeat(121)), /reason/);
  assert.equal(v2("x".repeat(120)).identity?.credentials[0].reason.length, 120);
});

test("an unknown credential type is refused", () => {
  for (const type of ["org:12", "mitglied"]) {
    assert.throws(
      () => validateManifest({ ...base, version: "2", identity: { credentials: [cred(type)] } }),
      /type/,
      type,
    );
  }
});

test("duplicates and more than 12 credentials are refused", () => {
  assert.throws(
    () => validateManifest({ ...base, version: "2", identity: { credentials: [cred("citizen"), cred("citizen")] } }),
    /doppelt/,
  );
  const many = Array.from({ length: 13 }, (_, i) => cred("type:0x" + i.toString(16).padStart(64, "0")));
  assert.throws(() => validateManifest({ ...base, version: "2", identity: { credentials: many } }), /12/);
  assert.equal(
    validateManifest({ ...base, version: "2", identity: { credentials: many.slice(0, 12) } }).identity?.credentials.length,
    12,
  );
});

test("profile and address must be booleans", () => {
  assert.throws(() => validateManifest({ ...base, version: "2", identity: { profile: "ja" } }), /profile/);
  assert.throws(() => validateManifest({ ...base, version: "2", identity: { address: 1 } }), /address/);
});

test("an unknown key inside identity is refused by name", () => {
  assert.throws(() => validateManifest({ ...base, version: "2", identity: { email: true } }), /email/);
  assert.throws(
    () => validateManifest({ ...base, version: "2", identity: { credentials: [{ type: "citizen", reason: "x", extra: 1 }] } }),
    /extra/,
  );
});

test("manifestStoreFields carries version and identity", () => {
  const v1 = manifestStoreFields(validateManifest(base));
  assert.equal(v1.manifest_version, "1");
  assert.equal(v1.identity, null);
  assert.equal(v1.name, "Abstimmung");
  assert.equal(v1.home_url, base.homeUrl);
  assert.equal(v1.primary_color, "#00498B");
  assert.equal("slug" in v1, false);

  const identity = { profile: true, address: false, credentials: [cred("citizen")] };
  const v2 = manifestStoreFields(validateManifest({ ...base, version: "2", identity }));
  assert.equal(v2.manifest_version, "2");
  assert.deepEqual(v2.identity, identity);

  assert.equal(manifestStoreFields(validateManifest({ ...base, version: "2" })).identity, null);
});
