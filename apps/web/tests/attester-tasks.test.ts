import test from "node:test";
import assert from "node:assert/strict";
import { planOrgRequestNotices, orgRequestCopy } from "../src/lib/attester-tasks/org-requests";

const base = {
  requests: [
    { id: 2, status: 0, orgId: "0xAB", safe: "0xsafe", expiresAt: 2000 },
    { id: 1, status: 1, orgId: "0xCD", safe: "0xsafe2", expiresAt: 2000 },
    { id: 0, status: 0, orgId: "0xEF", safe: "0xsafe3", expiresAt: 500 },
  ],
  attesters: ["0xMAX", "0xA", "0xB", "0xC"],
  voted: new Set(["2:0xb"]),
  owners: new Map([[2, new Set(["0xmax"])]]),
  notified: new Set(["2:0xc"]),
  names: new Map([["0xab", "Röbel.APP News"]]),
  now: 1000,
};

test("only pending, unexpired requests; skips owners, voters and the already notified", () => {
  const plan = planOrgRequestNotices(base);
  assert.deepEqual(plan, [{ wallet: "0xa", requestId: 2, orgName: "Röbel.APP News" }]);
});

test("copy names the org, or falls back", () => {
  assert.match(orgRequestCopy("Röbel.APP News").body, /„Röbel.APP News“/);
  assert.match(orgRequestCopy(null).body, /^Eine Organisation/);
});
