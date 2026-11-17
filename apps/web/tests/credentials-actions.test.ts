import { test } from "node:test";
import assert from "node:assert/strict";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { CREDENTIAL_REGISTRY_ABI, credentialTypeId, type ChainLog, type RegisterLog, type RegisterStep } from "@netizen-labs/credential-registry";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import {
  cancelAction,
  getActionForPhone,
  listOrgs,
  prepareAction,
  prepareMembersPublicAction,
  prepareTypeAction,
  recordSubmitted,
  type Deps,
} from "../src/lib/credentials/actions";
import type { Caller } from "../src/lib/credentials/caller";
import type { Notifier } from "../src/lib/credentials/notify";
import { ACTION_TTL_MS } from "../src/lib/credentials/config";

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const FRAKTION = "7a2d3b8f-1e4c-4d66-8b2f-3c4d5e6f7081";
const OTHER = "8b3e4c90-2f5d-4e77-9c30-4d5e6f708192";
const OWNER = "0x00000000000000000000000000000000000000a1";
const ADMIN = "0x00000000000000000000000000000000000000a2";
const MEMBER = "0x00000000000000000000000000000000000000a3";
const OTHER_ADMIN = "0x00000000000000000000000000000000000000a4";
const T0 = Date.parse("2026-11-17T10:00:00Z");

type Opts = { registered?: string[]; managers?: string[]; privateOnly?: string[] };

function world(opts: Opts = {}) {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: "https://x/v.png", membersPublicColumn: null });
  store.seedAccount({ id: FRAKTION, accountType: "organisation", name: "Fraktion Grün", subType: "fraktion", avatarUrl: null, membersPublicColumn: null });
  store.seedAccount({ id: OTHER, accountType: "organisation", name: "Anglerclub", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  for (const org of [VEREIN, FRAKTION]) {
    store.seedOwner(org, OWNER, "owner");
    store.seedOwner(org, ADMIN, "admin");
    store.seedOwner(org, MEMBER, "member");
  }
  store.seedOwner(OTHER, OTHER_ADMIN, "admin");
  store.seedOwner(OTHER, OWNER, "member");

  const registered = new Set((opts.registered ?? [VEREIN, FRAKTION, OTHER]).map((u) => orgIdFromUuid(u).toLowerCase()));
  const managers = new Set((opts.managers ?? [OWNER, ADMIN, OTHER_ADMIN]).map((w) => w.toLowerCase()));
  const privateOnly = new Set((opts.privateOnly ?? []).map((u) => orgIdFromUuid(u).toLowerCase()));
  const reader = {
    isOrgRegistered: async (orgId: Hex) => registered.has(orgId.toLowerCase()),
    canManage: async (orgId: Hex, a: Address) => registered.has(orgId.toLowerCase()) && managers.has(a.toLowerCase()),
    orgPrivateOnly: async (orgId: Hex) => privateOnly.has(orgId.toLowerCase()),
  };
  const pushes: Parameters<Notifier["push"]>[0][] = [];
  const receipts = new Map<string, { status: "success" | "reverted"; logs: ChainLog[] }>();
  const applied: { actionId: string; logs: readonly RegisterLog[] }[] = [];
  let now = T0;
  const d: Deps = {
    store,
    reader: reader as never,
    receipt: async (tx) => receipts.get(tx.toLowerCase()) ?? null,
    notify: { push: async (p) => void pushes.push(p) },
    now: () => now,
    registry: REGISTRY,
    applyConfirmed: async (actionId, logs) => {
      applied.push({ actionId, logs });
    },
  };
  return { d, store, pushes, receipts, applied, advance: (ms: number) => (now += ms) };
}

function caller(wallet: string, action: Caller["action"], via: Caller["via"] = "chat_session"): Caller {
  return { ok: true, wallet, via, action, payload: {} };
}

function must<T>(r: { ok: true; data: T } | { ok: false; status: number; code: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : `${(r as { code: string }).code}`);
  return (r as { data: T }).data;
}

function batchAddedLog(typeId: Hex, root: Hex, batchId: bigint): ChainLog {
  const topics = encodeEventTopics({ abi: CREDENTIAL_REGISTRY_ABI, eventName: "BatchAdded", args: { batchId, typeId, issuer: OWNER as Address } } as never) as Hex[];
  return { address: REGISTRY, topics, data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }], [root, 3]) };
}

const ROOT = `0x${"ab".repeat(32)}` as Hex;
const ROOT2 = `0x${"cd".repeat(32)}` as Hex;

async function onchainType(store: InMemoryCredentialStore, accountId: string): Promise<Hex> {
  const orgId = orgIdFromUuid(accountId) as Hex;
  const localId = `0x${"11".repeat(32)}` as Hex;
  const typeId = credentialTypeId(orgId, localId);
  const row: TypeRow = {
    typeId, registry: REGISTRY, accountId, orgId, localUuid: null, localId, kind: "membership", policy: "issuer_batch",
    name: "Mitglied", description: null, imageUrl: null, benefits: [], template: "mitglied", defaultValiditySeconds: 0,
    claimStart: null, claimEnd: null, supplyCap: 0, publicClaim: true, recognised: false, retired: false,
    chainStatus: "onchain", eventId: null, createdBy: OWNER, createdAt: new Date(T0).toISOString(),
  };
  await store.upsertType(row);
  return typeId;
}

async function batchAction(w: ReturnType<typeof world>, typeId: Hex) {
  const org = { accountId: VEREIN, orgId: orgIdFromUuid(VEREIN) as Hex, name: "Heimatverein", subType: "verein", membersPublicColumn: null, role: "owner" as const };
  const steps: RegisterStep[] = [{ fn: "addBatch", typeId, root: ROOT, count: 3 }];
  return prepareAction(w.d, { org, wallet: OWNER, via: "dashboard", steps, summary: { title: "3 Mitgliedsausweise ausstellen", lines: [], orgName: "Heimatverein" } });
}

test("type_prepare writes a draft row and a createType step with the node metadata URL", async () => {
  const w = world();
  const r = must(await prepareTypeAction(w.d, caller(OWNER, "type_prepare"), { accountId: VEREIN, op: "create", template: "vorstand" }));
  const row = await w.store.getType(r.typeId);
  assert.ok(row);
  assert.equal(row.chainStatus, "draft");
  assert.equal(row.accountId, VEREIN);
  assert.equal(row.name, "Vorstand");
  assert.equal(row.kind, "role");
  assert.ok(row.localUuid);
  const action = await w.store.getAction(r.actionId);
  assert.ok(action);
  assert.equal(action.status, "awaiting_confirmation");
  assert.equal(action.steps.length, 1);
  const step = action.steps[0];
  assert.equal(step.fn, "createType");
  if (step.fn !== "createType") return;
  assert.equal(credentialTypeId(step.orgId, step.localId), r.typeId);
  assert.equal(step.config.metadataURI, `https://www.roebel.app/api/credentials/types/${r.typeId}/metadata`);
  assert.equal(step.config.publicClaim, true);
  assert.equal(step.kind, "role");
  assert.equal(action.expiresAt, new Date(T0 + ACTION_TTL_MS).toISOString());
});

test("the first membership type of a fraktion gets a leading setOrgPrivateOnly(true) step and keeps publicClaim true", async () => {
  const w = world();
  const r = must(await prepareTypeAction(w.d, caller(OWNER, "type_prepare"), { accountId: FRAKTION, op: "create", template: "mitglied" }));
  const action = (await w.store.getAction(r.actionId))!;
  assert.deepEqual(action.steps.map((s) => s.fn), ["setOrgPrivateOnly", "createType"]);
  assert.deepEqual(action.steps[0], { fn: "setOrgPrivateOnly", orgId: orgIdFromUuid(FRAKTION), privateOnly: true });
  const create = action.steps[1];
  assert.ok(create.fn === "createType" && create.config.publicClaim === true);

  // Once the chain flag is set, no leading step.
  const w2 = world({ privateOnly: [FRAKTION] });
  const r2 = must(await prepareTypeAction(w2.d, caller(OWNER, "type_prepare"), { accountId: FRAKTION, op: "create", template: "mitglied" }));
  assert.deepEqual((await w2.store.getAction(r2.actionId))!.steps.map((s) => s.fn), ["createType"]);
  // A role type never needs it.
  const r3 = must(await prepareTypeAction(w.d, caller(OWNER, "type_prepare"), { accountId: FRAKTION, op: "create", template: "vorstand" }));
  assert.deepEqual((await w.store.getAction(r3.actionId))!.steps.map((s) => s.fn), ["createType"]);
});

test("members_public_prepare opens and closes with one setOrgPrivateOnly step; a member role is FORBIDDEN", async () => {
  const w = world();
  const open = must(await prepareMembersPublicAction(w.d, caller(ADMIN, "members_public_prepare"), { accountId: FRAKTION, membersPublic: true }));
  const a1 = (await w.store.getAction(open.actionId))!;
  assert.deepEqual(a1.steps, [{ fn: "setOrgPrivateOnly", orgId: orgIdFromUuid(FRAKTION), privateOnly: false }]);
  assert.equal(a1.summary.title, "Mitglieder dürfen öffentlich sichtbar sein");

  const close = must(await prepareMembersPublicAction(w.d, caller(OWNER, "members_public_prepare"), { accountId: VEREIN, membersPublic: false }));
  const a2 = (await w.store.getAction(close.actionId))!;
  assert.deepEqual(a2.steps, [{ fn: "setOrgPrivateOnly", orgId: orgIdFromUuid(VEREIN), privateOnly: true }]);
  assert.equal(a2.summary.title, "Mitglieder nur noch privat");

  const r = await prepareMembersPublicAction(w.d, caller(MEMBER, "members_public_prepare"), { accountId: VEREIN, membersPublic: true });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 403);
    assert.equal(r.code, "FORBIDDEN");
  }
  assert.equal(w.store.actions.size, 2);
});

test("orgs_list returns only owner/admin orgs with their chain readiness", async () => {
  const w = world({ registered: [VEREIN, OTHER] });
  const orgs = must(await listOrgs(w.d, caller(OWNER, "orgs_list")));
  assert.deepEqual(
    orgs.map((o) => [o.accountId, o.role, o.onChain, o.membersMayBePublic]).sort(),
    [
      [FRAKTION, "owner", "org_not_registered", false],
      [VEREIN, "owner", "ready", true],
    ].sort(),
  );
  const v = orgs.find((o) => o.accountId === VEREIN)!;
  assert.equal(v.name, "Heimatverein");
  assert.equal(v.avatarUrl, "https://x/v.png");
  assert.equal(v.subType, "verein");
  assert.equal(must(await listOrgs(w.d, caller(MEMBER, "orgs_list"))).length, 0);

  const w2 = world({ managers: [] });
  const o2 = must(await listOrgs(w2.d, caller(ADMIN, "orgs_list")));
  assert.ok(o2.every((o) => o.onChain === "no_chain_authority"));
});

test("a membership type for a verein keeps the requested publicClaim", async () => {
  const w = world();
  const r = must(await prepareTypeAction(w.d, caller(OWNER, "type_prepare"), { accountId: VEREIN, op: "create", template: "mitglied", publicClaim: false }));
  const action = (await w.store.getAction(r.actionId))!;
  assert.deepEqual(action.steps.map((s) => s.fn), ["createType"]);
  const step = action.steps[0];
  assert.ok(step.fn === "createType" && step.config.publicClaim === false);
  assert.equal((await w.store.getType(r.typeId))!.publicClaim, false);
});

test("preparing for an org that is not registered on chain is 409 ORG_NOT_ON_CHAIN and writes nothing", async () => {
  const w = world({ registered: [] });
  const r = await prepareTypeAction(w.d, caller(OWNER, "type_prepare"), { accountId: VEREIN, op: "create", template: "mitglied" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 409);
    assert.equal(r.code, "ORG_NOT_ON_CHAIN");
    assert.equal(r.message, "Diese Organisation ist noch nicht im öffentlichen Register eingetragen.");
  }
  assert.equal(w.store.types.size, 0);
  assert.equal(w.store.actions.size, 0);
  assert.equal(w.pushes.length, 0);
});

test("a DB admin without chain authority gets 409 NO_CHAIN_AUTHORITY", async () => {
  const w = world({ managers: [OWNER] });
  const r = await prepareMembersPublicAction(w.d, caller(ADMIN, "members_public_prepare"), { accountId: VEREIN, membersPublic: false });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 409);
    assert.equal(r.code, "NO_CHAIN_AUTHORITY");
    assert.match(r.message, /Onchain-Organisation/);
  }
  assert.equal(w.store.actions.size, 0);
});

test("prepareAction pushes credential_action to the preparer with the action id", async () => {
  const w = world();
  const typeId = await onchainType(w.store, VEREIN);
  const r = await batchAction(w, typeId);
  assert.equal(w.pushes.length, 1);
  assert.deepEqual(w.pushes[0], {
    wallets: [OWNER],
    type: "credential_action",
    title: "3 Mitgliedsausweise ausstellen",
    body: "Tippe, um in der App zu bestätigen.",
    data: { type: "credential_action", actionId: r.actionId },
  });
  assert.equal(r.expiresAt, new Date(T0 + ACTION_TTL_MS).toISOString());
});

test("another admin of the same org may fetch the action; an admin of another org gets 404", async () => {
  const w = world();
  const typeId = await onchainType(w.store, VEREIN);
  const { actionId } = await batchAction(w, typeId);
  const got = must(await getActionForPhone(w.d, caller(ADMIN, "action_get", "signature"), actionId));
  assert.equal(got.id, actionId);
  assert.equal(got.status, "awaiting_confirmation");
  assert.equal(got.registry, REGISTRY);
  assert.deepEqual(got.steps, [{ fn: "addBatch", typeId, root: ROOT, count: 3 }]);
  assert.equal(got.summary.title, "3 Mitgliedsausweise ausstellen");

  for (const wallet of [OTHER_ADMIN, MEMBER]) {
    const r = await getActionForPhone(w.d, caller(wallet, "action_get", "signature"), actionId);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 404);
  }
  const unknown = await getActionForPhone(w.d, caller(ADMIN, "action_get", "signature"), "00000000-0000-4000-8000-000000000000");
  assert.ok(!unknown.ok && unknown.status === 404);
});

test("an expired action is returned as expired and cannot be submitted", async () => {
  const w = world();
  const typeId = await onchainType(w.store, VEREIN);
  const { actionId } = await batchAction(w, typeId);
  w.advance(ACTION_TTL_MS + 1);
  const got = must(await getActionForPhone(w.d, caller(OWNER, "action_get", "signature"), actionId));
  assert.equal(got.status, "expired");
  assert.equal((await w.store.getAction(actionId))!.status, "expired");
  const tx = `0x${"99".repeat(32)}` as Hex;
  w.receipts.set(tx, { status: "success", logs: [batchAddedLog(typeId, ROOT, 7n)] });
  const r = await recordSubmitted(w.d, caller(OWNER, "action_submitted", "signature"), { actionId, txHash: tx });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 409);
    assert.equal(r.code, "ACTION_EXPIRED");
  }
  assert.equal(w.applied.length, 0);
});

test("recordSubmitted: reverted receipt → failed; missing receipt → submitted; confirmed receipt → done", async () => {
  const w = world();
  const typeId = await onchainType(w.store, VEREIN);
  const c = caller(ADMIN, "action_submitted", "signature");

  const a = await batchAction(w, typeId);
  const txA = `0x${"01".repeat(32)}` as Hex;
  w.receipts.set(txA, { status: "reverted", logs: [] });
  const ra = await recordSubmitted(w.d, c, { actionId: a.actionId, txHash: txA });
  assert.equal(ra.ok, false);
  const rowA = (await w.store.getAction(a.actionId))!;
  assert.equal(rowA.status, "failed");
  assert.equal(rowA.txHash, txA);
  assert.ok(rowA.error);

  // A fresh root for each batch action.
  const org = { accountId: VEREIN, orgId: orgIdFromUuid(VEREIN) as Hex, name: "Heimatverein", subType: "verein", membersPublicColumn: null, role: "owner" as const };
  const b = await prepareAction(w.d, { org, wallet: OWNER, via: "dashboard", steps: [{ fn: "addBatch", typeId, root: ROOT2, count: 3 }], summary: { title: "x", lines: [], orgName: null } });
  const txB = `0x${"02".repeat(32)}` as Hex;
  assert.deepEqual(must(await recordSubmitted(w.d, c, { actionId: b.actionId, txHash: txB })), { status: "submitted" });
  const rowB = (await w.store.getAction(b.actionId))!;
  assert.equal(rowB.status, "submitted");
  assert.equal(rowB.txHash, txB);
  assert.equal(rowB.confirmedBy, ADMIN);
  assert.equal(w.applied.length, 0);

  // The receipt shows up; reporting again finishes it.
  w.receipts.set(txB, { status: "success", logs: [batchAddedLog(typeId, ROOT2, 9n)] });
  assert.deepEqual(must(await recordSubmitted(w.d, c, { actionId: b.actionId, txHash: txB })), { status: "done" });
  assert.equal((await w.store.getAction(b.actionId))!.status, "done");
  assert.equal(w.applied.length, 1);
  assert.equal(w.applied[0].actionId, b.actionId);
  assert.equal(w.applied[0].logs[0].eventName, "BatchAdded");
  assert.equal(w.applied[0].logs[0].args.batchId, 9n);
  // Done is final.
  const again = await recordSubmitted(w.d, c, { actionId: b.actionId, txHash: txB });
  assert.deepEqual(must(again), { status: "done" });
  assert.equal(w.applied.length, 1);
});

test("recordSubmitted refuses a receipt whose BatchAdded root differs from the step", async () => {
  const w = world();
  const typeId = await onchainType(w.store, VEREIN);
  const { actionId } = await batchAction(w, typeId);
  const tx = `0x${"03".repeat(32)}` as Hex;
  w.receipts.set(tx, { status: "success", logs: [batchAddedLog(typeId, ROOT2, 4n)] });
  const r = await recordSubmitted(w.d, caller(OWNER, "action_submitted", "signature"), { actionId, txHash: tx });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "TX_MISMATCH");
  assert.equal((await w.store.getAction(actionId))!.status, "failed");
  assert.equal(w.applied.length, 0);
});

test("cancelAction works only while awaiting confirmation", async () => {
  const w = world();
  const typeId = await onchainType(w.store, VEREIN);
  const { actionId } = await batchAction(w, typeId);
  const r0 = await cancelAction(w.d, caller(OTHER_ADMIN, "action_cancel"), actionId);
  assert.ok(!r0.ok && r0.status === 404);
  must(await cancelAction(w.d, caller(ADMIN, "action_cancel"), actionId));
  assert.equal((await w.store.getAction(actionId))!.status, "cancelled");
  const r = await cancelAction(w.d, caller(OWNER, "action_cancel"), actionId);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 409);
    assert.equal(r.code, "ACTION_NOT_PENDING");
  }
});
