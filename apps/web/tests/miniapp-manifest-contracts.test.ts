// apps/web/tests/miniapp-manifest-contracts.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FORBIDDEN_CONTRACTS,
  MAX_CONTRACTS,
  MAX_FUNCTIONS,
  rulesFor,
  sponsorRules,
  validateContracts,
  weiToXdai,
  xdaiToWei,
} from "../src/lib/miniapp/contracts";
import {
  manifestStoreFields,
  missingNewColumns,
  validateManifest,
  withoutColumns,
} from "../src/lib/miniapp/manifest";

const A1 = "0xabc0000000000000000000000000000000000001";
const addr = (n: number) => `0xabc${n.toString(16).padStart(37, "0")}`;
const base = {
  slug: "fitness",
  name: "Fitness",
  homeUrl: "https://fitness.example.app/",
  description: "Trainiere.",
  category: "community",
};

test("a declaration is normalised and its selectors derived", () => {
  const c = validateContracts([
    { address: "0xAbC0000000000000000000000000000000000001", label: " Trainingsbuch ", functions: ["checkIn(uint256)"] },
  ]);
  assert.deepEqual(c, [{ address: A1, label: "Trainingsbuch", functions: ["checkIn(uint256)"] }]);
  const rules = rulesFor(c);
  assert.equal(rules[0].address, A1);
  assert.equal(Object.values(rules[0].selectors)[0], "checkIn(uint256)");
  // keccak256("checkIn(uint256)")[0..4]
  assert.match(Object.keys(rules[0].selectors)[0], /^0x[0-9a-f]{8}$/);
});

test("Röbel's own contracts cannot be declared", () => {
  assert.ok(FORBIDDEN_CONTRACTS.length > 10);
  for (const a of FORBIDDEN_CONTRACTS) {
    assert.throws(() => validateContracts([{ address: a, label: "x", functions: ["f()"] }]), /invalid_params|Röbel|nicht/);
    assert.throws(() => validateContracts([{ address: a.toLowerCase(), label: "x", functions: ["f()"] }]));
  }
});

test("the Circles Hub and the recovery module are on the forbidden list", () => {
  const lower = FORBIDDEN_CONTRACTS.map((a) => a.toLowerCase());
  assert.ok(lower.includes("0xc12c1e50abb450d6205ea2c3fa861b3b834d13e8"));
  assert.ok(lower.includes("0x38275826e1933303e508433dd5f289315da2541c"));
  assert.ok(lower.includes("0x0000000000000000000000000000000000000000"));
});

test("a malformed signature is refused by name", () => {
  for (const sig of ["foo", "transfer(address, uint)", "transfer(address,uint256", "1abc()"]) {
    assert.throws(
      () => validateContracts([{ address: A1, label: "x", functions: [sig] }]),
      (e: Error) => e.message.includes(sig),
      sig,
    );
  }
});

test("more than 8 contracts, more than 16 functions, duplicates are refused", () => {
  assert.equal(MAX_CONTRACTS, 8);
  assert.equal(MAX_FUNCTIONS, 16);
  const nine = Array.from({ length: 9 }, (_, i) => ({ address: addr(i + 1), label: `C${i}`, functions: ["f()"] }));
  assert.throws(() => validateContracts(nine));
  assert.equal(validateContracts(nine.slice(0, 8)).length, 8);
  const fns = Array.from({ length: 17 }, (_, i) => `f${i}()`);
  assert.throws(() => validateContracts([{ address: A1, label: "x", functions: fns }]));
  assert.throws(() => validateContracts([{ address: A1, label: "x", functions: [] }]));
  assert.throws(() => validateContracts([{ address: A1, label: "x", functions: ["f()", "f()"] }]));
  assert.throws(() =>
    validateContracts([
      { address: A1, label: "x", functions: ["f()"] },
      { address: A1.toUpperCase().replace("0X", "0x"), label: "y", functions: ["g()"] },
    ]),
  );
});

test("address and label shapes are checked", () => {
  assert.throws(() => validateContracts("x"));
  assert.throws(() => validateContracts([{ address: "0x1234", label: "x", functions: ["f()"] }]));
  assert.throws(() => validateContracts([{ address: A1, label: "  ", functions: ["f()"] }]));
  assert.throws(() => validateContracts([{ address: A1, label: "x".repeat(41), functions: ["f()"] }]));
});

test("version 1 must not carry contracts", () => {
  assert.throws(
    () => validateManifest({ ...base, contracts: [{ address: A1, label: "x", functions: ["f()"] }] }),
    /contracts braucht miniapp.version "2"/,
  );
});

test("version 2 carries normalised contracts; the store fields always have a list", () => {
  const m = validateManifest({
    ...base,
    version: "2",
    contracts: [{ address: "0xAbC0000000000000000000000000000000000001", label: "Buch", functions: ["checkIn(uint256)"] }],
  });
  assert.deepEqual(m.contracts, [{ address: A1, label: "Buch", functions: ["checkIn(uint256)"] }]);
  assert.deepEqual(manifestStoreFields(m).contracts, m.contracts);
  assert.deepEqual(manifestStoreFields(validateManifest({ ...base, version: "2" })).contracts, []);
  const v1 = validateManifest(base);
  assert.equal("contracts" in v1, false);
  assert.equal("version" in v1, false);
  assert.deepEqual(manifestStoreFields(v1).contracts, []);
});

test("a missing contracts column is retried without contracts only; identity columns drop all new columns", () => {
  assert.deepEqual(
    missingNewColumns({ code: "PGRST204", message: "Could not find the 'contracts' column of 'mini_apps' in the schema cache" }),
    ["contracts"],
  );
  assert.deepEqual(missingNewColumns({ code: "42703", message: 'column "identity" does not exist' }), [
    "manifest_version",
    "identity",
    "contracts",
    "audience",
    "org_account_id",
    "org_binding",
    "org_binding_decided_at",
    "org_binding_decided_by",
  ]);
  assert.deepEqual(missingNewColumns({ code: "PGRST204", message: "Could not find the 'foo' column" }), []);
  assert.deepEqual(missingNewColumns(null), []);
  const f = manifestStoreFields(validateManifest({ ...base, version: "2" }));
  const out = withoutColumns(f, ["contracts"]);
  assert.equal("contracts" in out, false);
  assert.equal(out.manifest_version, "2");
});

test("sponsorRules: only a live version-2 row with declared contracts is sponsorable", () => {
  const contracts = [{ address: A1, label: "Buch", functions: ["checkIn(uint256)"] }];
  const live = { status: "live", manifest_version: "2", contracts, gas_budget_wei: "1000" };
  const r = sponsorRules(live);
  assert.ok(r);
  assert.equal(r.rules[0].address, A1);
  assert.equal(r.gasBudgetWei, 1000n);
  assert.equal(sponsorRules({ ...live, status: "pending" }), null);
  assert.equal(sponsorRules({ ...live, manifest_version: "1" }), null);
  assert.equal(sponsorRules({ ...live, contracts: [] }), null);
  assert.equal(sponsorRules({ ...live, contracts: undefined }), null);
  // A stored row that no longer validates (e.g. a now-forbidden address) is not sponsorable.
  assert.equal(sponsorRules({ ...live, contracts: [{ address: FORBIDDEN_CONTRACTS[0], label: "x", functions: ["f()"] }] }), null);
  assert.equal(sponsorRules({ ...live, gas_budget_wei: undefined })?.gasBudgetWei, 0n);
});

test("xdaiToWei parses a decimal xDAI amount and refuses anything else", () => {
  assert.equal(xdaiToWei("0.05"), 5n * 10n ** 16n);
  assert.equal(xdaiToWei("1"), 10n ** 18n);
  assert.equal(xdaiToWei(" 0,5 "), 5n * 10n ** 17n);
  assert.equal(xdaiToWei("0"), 0n);
  for (const bad of ["", "-1", "abc", "1e3", "0.0000000000000000001", "1000001"]) {
    assert.throws(() => xdaiToWei(bad), bad);
  }
});

test("weiToXdai formats wei for the admin card", () => {
  assert.equal(weiToXdai(5n * 10n ** 16n), "0.05");
  assert.equal(weiToXdai(0n), "0");
  assert.equal(weiToXdai("1000000000000000000"), "1");
});
