// apps/web/tests/miniapp-org-binding.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { bindingPatch, nextBinding, type OrgBinding } from "../src/lib/miniapp/orgBinding";
import { handleOrgBinding, type OrgBindingDeps } from "../src/lib/miniapp/orgBindingHandler";

const ORG = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const OTHER = "9c1f0d2e-1111-4222-8333-944455556666";
const WALLET = "0x" + "a".repeat(40);

test("a new org asks for confirmation", () => assert.equal(nextBinding({ orgAccountId: null, binding: "none" }, ORG), "requested"));
test("the same org keeps its confirmation", () => assert.equal(nextBinding({ orgAccountId: ORG, binding: "confirmed" }, ORG), "confirmed"));
test("the same org keeps a rejection", () => assert.equal(nextBinding({ orgAccountId: ORG, binding: "rejected" }, ORG.toUpperCase()), "rejected"));
test("another org starts over", () => assert.equal(nextBinding({ orgAccountId: ORG, binding: "confirmed" }, OTHER), "requested"));
test("dropping the org clears the binding", () => assert.equal(nextBinding({ orgAccountId: ORG, binding: "confirmed" }, null), "none"));

test("bindingPatch leaves an unchanged binding alone and resets a changed one", () => {
  assert.deepEqual(bindingPatch({ org_account_id: ORG, org_binding: "confirmed" }, { org_account_id: ORG }), {});
  assert.deepEqual(bindingPatch({ org_account_id: ORG, org_binding: "confirmed" }, { org_account_id: OTHER }), {
    org_binding: "requested",
    org_binding_decided_at: null,
    org_binding_decided_by: null,
  });
  assert.deepEqual(bindingPatch(null, { org_account_id: ORG }).org_binding, "requested");
  assert.deepEqual(bindingPatch(null, { org_account_id: null }), {});
  // Before the audience migration the patch carries no org column: nothing to do.
  assert.deepEqual(bindingPatch({ org_account_id: ORG, org_binding: "confirmed" }, {}), {});
});

type App = { id: string; org_account_id: string | null; org_binding: OrgBinding };

function deps(over: Partial<OrgBindingDeps> & { role?: Record<string, string> } = {}) {
  const calls: { id: string; b: OrgBinding; by: string }[] = [];
  const app: App = { id: "app1", org_account_id: ORG, org_binding: "requested" };
  const role = over.role ?? { [ORG]: "admin" };
  const d: OrgBindingDeps = {
    verify: async (body) => {
      const b = body as { action: string; payload: Record<string, unknown> };
      return { ok: true, wallet: WALLET, action: b.action as "org_binding_list", payload: b.payload };
    },
    roleOf: async (account) => role[account] ?? null,
    listApps: async () => [
      {
        id: "app1",
        slug: "psv",
        name: "PSV",
        icon_url: null,
        org_binding: "requested",
        wallet: WALLET,
        developers: { wallet: WALLET },
      } as never,
    ],
    getApp: async (ref) => (ref === "app1" ? app : null),
    setBinding: async (id, b, by) => {
      calls.push({ id, b, by });
    },
    ...over,
  };
  return { d, calls };
}

const req = (action: string, payload: Record<string, unknown>) => ({ action, payload });

test("an admin of the org can confirm", async () => {
  const { d, calls } = deps();
  const r = await handleOrgBinding(req("org_binding_decide", { app: "app1", decision: "confirm" }), null, d);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { binding: "confirmed" });
  assert.deepEqual(calls, [{ id: "app1", b: "confirmed", by: "admin" }]);
});

test("removing a confirmed binding rejects it", async () => {
  const { d, calls } = deps({
    role: { [ORG]: "owner" },
    getApp: async () => ({ id: "app1", org_account_id: ORG, org_binding: "confirmed" }),
  });
  const r = await handleOrgBinding(req("org_binding_decide", { app: "app1", decision: "remove" }), null, d);
  assert.deepEqual(r.json, { binding: "rejected" });
  assert.deepEqual(calls, [{ id: "app1", b: "rejected", by: "owner" }]);
});

test("a plain member cannot", async () => {
  const { d, calls } = deps({ role: { [ORG]: "member" } });
  const r = await handleOrgBinding(req("org_binding_decide", { app: "app1", decision: "confirm" }), null, d);
  assert.equal(r.status, 403);
  assert.equal(r.json.code, "forbidden");
  assert.equal(calls.length, 0);
  const l = await handleOrgBinding(req("org_binding_list", { account: ORG }), null, d);
  assert.equal(l.status, 403);
});

test("an owner of another org cannot", async () => {
  const { d, calls } = deps({ role: { [OTHER]: "owner" } });
  const r = await handleOrgBinding(req("org_binding_decide", { app: "app1", decision: "confirm" }), null, d);
  assert.equal(r.status, 403);
  assert.equal(calls.length, 0);
});

test("an unknown decision or app is refused", async () => {
  const { d } = deps();
  assert.equal((await handleOrgBinding(req("org_binding_decide", { app: "app1", decision: "maybe" }), null, d)).status, 400);
  assert.equal((await handleOrgBinding(req("org_binding_decide", { app: "nope", decision: "confirm" }), null, d)).status, 404);
  const none = deps({ getApp: async () => ({ id: "app1", org_account_id: null, org_binding: "none" }) }).d;
  assert.equal((await handleOrgBinding(req("org_binding_decide", { app: "app1", decision: "confirm" }), null, none)).status, 400);
});

test("a failed verification is passed through", async () => {
  const { d } = deps({ verify: async () => ({ ok: false, status: 401, code: "bad_signature", message: "x" }) });
  const r = await handleOrgBinding({}, null, d);
  assert.equal(r.status, 401);
});

test("the list never contains a wallet", async () => {
  const { d } = deps();
  const r = await handleOrgBinding(req("org_binding_list", { account: ORG.toUpperCase() }), null, d);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { apps: [{ id: "app1", slug: "psv", name: "PSV", iconUrl: null, binding: "requested" }] });
  assert.doesNotMatch(JSON.stringify(r.json), /0x[0-9a-f]{40}/i);
});

test("the list needs an org account id", async () => {
  const { d } = deps();
  assert.equal((await handleOrgBinding(req("org_binding_list", { account: "psv" }), null, d)).status, 400);
});
