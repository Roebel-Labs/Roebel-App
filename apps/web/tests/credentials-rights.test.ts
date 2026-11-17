import { test } from "node:test";
import assert from "node:assert/strict";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import type { Address, Hex } from "viem";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import {
  chainReadiness,
  createNodeRegistryReader,
  membersMayBePublic,
  needsPrivateOnlyStep,
  orgContextFor,
  type OrgContext,
} from "../src/lib/credentials/rights";

const ORG = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const OWNER = "0x00000000000000000000000000000000000000a1";
const ADMIN = "0x00000000000000000000000000000000000000a2";
const MEMBER = "0x00000000000000000000000000000000000000a3";
const STRANGER = "0x00000000000000000000000000000000000000a4";

function seeded(subType: string | null = "verein", membersPublicColumn: boolean | null = null) {
  const s = new InMemoryCredentialStore();
  s.seedAccount({ id: ORG, accountType: "organisation", name: "Heimatverein", subType, avatarUrl: null, membersPublicColumn });
  s.seedOwner(ORG, OWNER, "owner");
  s.seedOwner(ORG, ADMIN.toUpperCase().replace("0X", "0x"), "admin");
  s.seedOwner(ORG, MEMBER, "member");
  return s;
}

test("member role is FORBIDDEN, owner and admin pass", async () => {
  const s = seeded();
  const owner = await orgContextFor(s, ORG, OWNER);
  assert.ok(!("error" in owner));
  if ("error" in owner) return;
  assert.equal(owner.role, "owner");
  assert.equal(owner.orgId, orgIdFromUuid(ORG));
  assert.equal(owner.name, "Heimatverein");
  assert.equal(owner.subType, "verein");
  assert.equal(owner.membersPublicColumn, null);

  const admin = await orgContextFor(s, ORG, ADMIN);
  assert.ok(!("error" in admin) && admin.role === "admin");
  assert.deepEqual(await orgContextFor(s, ORG, MEMBER), { error: "FORBIDDEN" });
  assert.deepEqual(await orgContextFor(s, ORG, STRANGER), { error: "FORBIDDEN" });
  assert.deepEqual(await orgContextFor(s, "00000000-0000-4000-8000-000000000000", OWNER), { error: "NOT_FOUND" });
  assert.deepEqual(await orgContextFor(s, "not-a-uuid", OWNER), { error: "NOT_FOUND" });
});

test("fraktion and stadt start closed, every other sub-type open; a set column wins in both directions", () => {
  assert.equal(membersMayBePublic({ subType: "fraktion", membersPublicColumn: null }), false);
  assert.equal(membersMayBePublic({ subType: "stadt", membersPublicColumn: null }), false);
  for (const t of ["verein", "unternehmen", "restaurant", "journalist", null]) {
    assert.equal(membersMayBePublic({ subType: t, membersPublicColumn: null }), true, String(t));
  }
  assert.equal(membersMayBePublic({ subType: "fraktion", membersPublicColumn: true }), true);
  assert.equal(membersMayBePublic({ subType: "verein", membersPublicColumn: false }), false);
});

function ctx(subType: string | null, membersPublicColumn: boolean | null): OrgContext {
  return { accountId: ORG, orgId: orgIdFromUuid(ORG), name: "X", subType, membersPublicColumn, role: "owner" };
}

test("needsPrivateOnlyStep only for a closed org whose chain flag is not set yet", () => {
  assert.equal(needsPrivateOnlyStep(ctx("fraktion", null), false), true);
  assert.equal(needsPrivateOnlyStep(ctx("fraktion", null), true), false);
  assert.equal(needsPrivateOnlyStep(ctx("verein", false), false), true);
  assert.equal(needsPrivateOnlyStep(ctx("verein", null), false), false);
  assert.equal(needsPrivateOnlyStep(ctx("fraktion", true), false), false);
});

test("chainReadiness distinguishes an unregistered org from a caller without chain authority", async () => {
  const o = ctx("verein", null);
  const mk = (registered: boolean, managers: string[]) => ({
    isOrgRegistered: async (id: Hex) => registered && id === o.orgId,
    canManage: async (id: Hex, a: Address) => id === o.orgId && managers.includes(a.toLowerCase()),
  });
  assert.equal(await chainReadiness(mk(false, [OWNER]), o, OWNER as Address), "org_not_registered");
  assert.equal(await chainReadiness(mk(true, []), o, OWNER as Address), "no_chain_authority");
  assert.equal(await chainReadiness(mk(true, [OWNER]), o, OWNER as Address), "ready");
});

test("isOrgRegistered lets an RPC error through instead of reading it as not registered", async () => {
  const client = {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "orgRegistry") return "0x00000000000000000000000000000000000000b1";
      throw new Error("rpc unreachable");
    },
  };
  const reader = createNodeRegistryReader({ client: client as never, address: "0x00000000000000000000000000000000000000c1" });
  await assert.rejects(() => reader.isOrgRegistered(orgIdFromUuid(ORG) as Hex), /rpc unreachable/);
});

test("the store refuses an empty invitation filter for list and bulk update", async () => {
  const s = seeded();
  await assert.rejects(() => s.listInvitations({}), /EMPTY_FILTER/);
  await assert.rejects(() => s.updateInvitations({}, { status: "revoked" }), /EMPTY_FILTER/);
  assert.deepEqual(await s.listInvitations({ statuses: ["invited"] }), []);
});
