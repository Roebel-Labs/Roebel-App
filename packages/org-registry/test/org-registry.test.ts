import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { deriveOrgIdentity } from "@netizen-labs/nostr";
import { ORG_REGISTRY_ABI } from "../src/abi.js";
import { replayOrgEvents, type DirectoryLog } from "../src/replay.js";
import { createOrgRegistryReader } from "../src/reader.js";
import { planOrgMigration, thresholdFor } from "../src/plan.js";

const U1 = "6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10";
const U2 = "0b9e4c55-7a1f-4e3a-8d2c-5a6b7c8d9e0f";
const ORG = orgIdFromUuid(U1);
const SAFE_A = `0x${"a".repeat(40)}` as const;
const SAFE_B = `0x${"b".repeat(40)}` as const;
const W = (c: string) => `0x${c.repeat(40)}`;
const PK = "1".repeat(64);

let n = 0;
const log = (eventName: DirectoryLog["eventName"], args: Record<string, unknown>, block = 1n): DirectoryLog => ({
  eventName,
  args: { orgId: ORG, ...args },
  blockNumber: block,
  logIndex: n++,
});

test("replay rebuilds keys, roles, metadata and rotation", () => {
  const dir = replayOrgEvents([
    log("OrgRegistered", { safe: SAFE_A }),
    log("MetadataURIChanged", { metadataURI: "ipfs://m" }),
    log("NostrKeySet", { pubkey: `0x${PK}`, authorized: true }),
    log("RoleSet", { account: W("c"), role: 2 }),
    log("RoleSet", { account: W("d"), role: 1 }),
    log("RoleSet", { account: W("d"), role: 0 }),
    log("SafeRotated", { previous: SAFE_A, next: SAFE_B }, 2n),
  ]);
  const org = dir.get(ORG)!;
  assert.equal(org.safe, SAFE_B);
  assert.equal(org.metadataURI, "ipfs://m");
  assert.deepEqual([...org.nostrKeys], [PK]);
  assert.deepEqual([...org.roles], [[W("c"), "admin"]]);
});

test("replay: revocation wipes the org; re-registration starts clean (contract generation semantics)", () => {
  const dir = replayOrgEvents([
    log("OrgRegistered", { safe: SAFE_A }, 1n),
    log("NostrKeySet", { pubkey: `0x${PK}`, authorized: true }, 1n),
    log("OrgRevoked", { safe: SAFE_A }, 2n),
    log("OrgRegistered", { safe: SAFE_B }, 3n),
  ]);
  assert.equal(dir.get(ORG)!.safe, SAFE_B);
  assert.equal(dir.get(ORG)!.nostrKeys.size, 0);
});

test("replay orders by block then log index regardless of input order", () => {
  const reg = log("OrgRegistered", { safe: SAFE_A }, 5n);
  const key = log("NostrKeySet", { pubkey: `0x${PK}`, authorized: true }, 6n);
  assert.equal(replayOrgEvents([key, reg]).get(ORG)!.nostrKeys.size, 1);
});

test("reader caches key lookups for cacheMs, then asks the chain again", async () => {
  let calls = 0;
  let t = 0;
  const client = {
    readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
      calls++;
      assert.equal(functionName, "isNostrKeyAuthorized");
      assert.equal(args[1], `0x${PK}`);
      return true;
    },
  };
  const reader = createOrgRegistryReader({ client: client as never, address: SAFE_A, cacheMs: 1000, now: () => t });
  assert.equal(await reader.isNostrKeyAuthorized(ORG, PK), true);
  assert.equal(await reader.isNostrKeyAuthorized(ORG, PK), true);
  assert.equal(calls, 1);
  t = 1500;
  await reader.isNostrKeyAuthorized(ORG, PK);
  assert.equal(calls, 2);
});

test("plan: owners → Safe (parity threshold 1), admins/members → roles, EOA-less orgs skipped", () => {
  const plan = planOrgMigration(
    [
      { id: U1, account_type: "organisation", sub_type: "verein", name: "Heimatverein" },
      { id: U2, account_type: "organisation", sub_type: "restaurant", name: "Ohne Besitzer" },
      { id: "3f0e0000-0000-4000-8000-000000000000", account_type: "personal", name: "Anna" },
    ],
    [
      { account_id: U1, wallet_address: W("E"), role: "owner" },
      { account_id: U1, wallet_address: W("f"), role: "owner" },
      { account_id: U1, wallet_address: W("c"), role: "admin" },
      { account_id: U1, wallet_address: W("d"), role: "member" },
      { account_id: U1, wallet_address: W("e"), role: "admin" }, // also owner → no role
      { account_id: U1, wallet_address: "0xnope", role: "member" },
      { account_id: U2, wallet_address: W("c"), role: "admin" },
    ],
  );
  assert.equal(plan.orgs.length, 1);
  const org = plan.orgs[0];
  assert.equal(org.orgId, ORG);
  assert.deepEqual(org.safe, { owners: [W("e"), W("f")], threshold: 1 });
  assert.deepEqual(org.roles, [
    { account: W("c"), role: "admin" },
    { account: W("d"), role: "member" },
  ]);
  assert.equal(org.nodeNostrPubkey, null);
  assert.deepEqual(
    plan.skipped.map((s) => s.reason).sort(),
    ["no_owner", "not_an_organisation"],
  );
  assert.equal(plan.invalidWallets.length, 1);
});

test("plan authorises the node-derived key the publisher already signs with", () => {
  const secret = "s".repeat(40);
  const plan = planOrgMigration(
    [{ id: U1, account_type: "organisation", name: "Kino" }],
    [{ account_id: U1, wallet_address: W("e"), role: "owner" }],
    { nodeSecret: secret, nodeId: "roebel" },
  );
  assert.equal(plan.orgs[0].nodeNostrPubkey, deriveOrgIdentity(secret, "roebel", U1).publicKey);
});

test("majority threshold", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((k) => thresholdFor(k, "majority")), [1, 2, 2, 3, 3]);
  assert.throws(() => thresholdFor(0, "parity"));
});

test("hand-written ABI matches the compiled OrgRegistry artifact", (t) => {
  const path = new URL(
    "../../../contracts/governor-contract/artifacts/contracts/verification-system/OrgRegistry.sol/OrgRegistry.json",
    import.meta.url,
  );
  if (!existsSync(path)) return t.skip("artifact not compiled");
  const compiled = JSON.parse(readFileSync(path, "utf8")).abi as Array<{ type: string; name?: string; inputs?: unknown[]; outputs?: unknown[] }>;
  const sig = (e: { type: string; name?: string; inputs?: unknown[]; outputs?: unknown[] }) =>
    JSON.stringify({ type: e.type, name: e.name, inputs: e.inputs, outputs: e.outputs ?? null }, (k, v) => {
      if (k === "internalType") return undefined;
      // key order differs between solc output and hand-written ABI
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]));
      }
      return v;
    });
  const have = new Set(compiled.map(sig));
  for (const item of ORG_REGISTRY_ABI) assert.ok(have.has(sig(item as never)), `ABI drift: ${item.name}`);
});
