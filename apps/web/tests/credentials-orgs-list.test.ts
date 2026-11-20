import { test } from "node:test";
import assert from "node:assert/strict";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import type { Address, Hex } from "viem";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import { listOrgs, ORG_CHAIN_CHECK_MS, type Deps } from "../src/lib/credentials/actions";
import type { Caller } from "../src/lib/credentials/caller";

const OWNER = "0x00000000000000000000000000000000000000a1";
const ORGS = ["6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70", "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f71", "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f72"];

function deps(isOrgRegistered: (orgId: Hex) => Promise<boolean>): Deps {
  const store = new InMemoryCredentialStore();
  ORGS.forEach((id, i) => {
    store.seedAccount({ id, accountType: "organisation", name: `Verein ${i}`, subType: "verein", avatarUrl: null, membersPublicColumn: null });
    store.seedOwner(id, OWNER, "owner");
  });
  const reader = { isOrgRegistered, canManage: async (_o: Hex, a: Address) => a.toLowerCase() === OWNER, orgPrivateOnly: async () => false, leafRevoked: async () => false, holdsMany: async () => [] };
  return { store, reader: reader as never, receipt: async () => null, head: async () => 1n, notify: { push: async () => {} }, now: () => Date.now(), registry: "0x00000000000000000000000000000000000000c1", applyConfirmed: async () => {} } as Deps;
}

const caller: Caller = { ok: true, wallet: OWNER, via: "chat_session", action: "orgs_list", payload: {} };

test("orgs_list checks orgs in parallel and bounds a chain read that never answers", async () => {
  const ready = orgIdFromUuid(ORGS[0]).toLowerCase();
  const hanging = orgIdFromUuid(ORGS[1]).toLowerCase();
  const d = deps(async (orgId) => {
    if (orgId.toLowerCase() === hanging) return new Promise<boolean>(() => {});
    return orgId.toLowerCase() === ready;
  });
  const started = Date.now();
  const r = await listOrgs(d, caller);
  const took = Date.now() - started;
  assert.equal(r.ok, true);
  const list = (r as { data: { name: string; onChain: string }[] }).data;
  assert.deepEqual(list.map((o) => [o.name, o.onChain]), [["Verein 0", "ready"], ["Verein 1", "org_not_registered"], ["Verein 2", "org_not_registered"]]);
  assert.ok(took < ORG_CHAIN_CHECK_MS + 1500, `took ${took} ms`);
});

test("a failing chain read counts as not registered instead of failing the list", async () => {
  const d = deps(async () => {
    throw new Error("rpc down");
  });
  const r = await listOrgs(d, caller);
  assert.equal(r.ok, true);
  assert.ok((r as { data: { onChain: string }[] }).data.every((o) => o.onChain === "org_not_registered"));
});
