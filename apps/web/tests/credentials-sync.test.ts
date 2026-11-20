import { test } from "node:test";
import assert from "node:assert/strict";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId, type RegisterLog } from "@netizen-labs/credential-registry";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { InMemoryCredentialStore, type ActionRow, type NewInvitation, type TypeRow } from "../src/lib/credentials/store";
import { applyConfirmedAction, applyRegisterLogs, sweepUndelivered, syncRegister, type SyncDeps } from "../src/lib/credentials/sync";
import { deliverInvitations } from "../src/lib/credentials/delivery";
import type { Notifier } from "../src/lib/credentials/notify";

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const FRAKTION = "7a2d3b8f-1e4c-4d66-8b2f-3c4d5e6f7081";
const OWNER = "0x00000000000000000000000000000000000000a1";
const ALICE = "0x00000000000000000000000000000000000000b1";
const BOB = "0x00000000000000000000000000000000000000b2";
const ROOT = keccak256(toHex("root-1"));
const LEAF_A = keccak256(toHex("leaf-a"));
const LEAF_B = keccak256(toHex("leaf-b"));
const ACTION_ID = "11111111-1111-4111-8111-111111111111";
const BATCH_ID = "22222222-2222-4222-8222-222222222222";
const T0 = "2026-11-17T10:00:00.000Z";

const typeIdOf = (account: string, local: string) => credentialTypeId(orgIdFromUuid(account) as Hex, keccak256(toHex(local))).toLowerCase() as Hex;
const TYPE = typeIdOf(VEREIN, "mitglied");
const FRAKTION_TYPE = typeIdOf(FRAKTION, "mitglied");

let logIndex = 0;
const log = (eventName: RegisterLog["eventName"], args: Record<string, unknown>, blockNumber = 200n): RegisterLog => ({ eventName, args, blockNumber, logIndex: logIndex++ });

function typeRow(typeId: Hex, accountId: string): TypeRow {
  return {
    typeId, registry: REGISTRY, accountId, orgId: orgIdFromUuid(accountId) as Hex, localUuid: null, localId: keccak256(toHex("mitglied")),
    kind: "membership", policy: "issuer_batch", name: "Mitglied", description: null, imageUrl: null, benefits: [], template: null,
    defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0, publicClaim: true, recognised: false, retired: false,
    chainStatus: "onchain", eventId: null, createdBy: OWNER, createdAt: T0,
  };
}

function invitation(id: string, leafHash: Hex, wallet: string | null, typeId: Hex = TYPE): NewInvitation {
  return {
    id, typeId, leafKind: wallet ? "account" : "claim_key", subject: wallet ?? "0x00000000000000000000000000000000000000d1", validUntil: "0",
    salt: keccak256(toHex(id)), leafHash, proof: [], claimKeyEnc: null, tokenHash: null, tokenEnc: null, recipientWallet: wallet,
    displayName: null, contactEmail: null,
  };
}

async function world(opts: { actionStatus?: ActionRow["status"]; typeId?: Hex; accountId?: string } = {}) {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedAccount({ id: FRAKTION, accountType: "organisation", name: "Fraktion Grün", subType: "fraktion", avatarUrl: null, membersPublicColumn: null });
  const typeId = opts.typeId ?? TYPE;
  await store.upsertType(typeRow(typeId, opts.accountId ?? VEREIN));
  await store.insertAction({
    id: ACTION_ID, accountId: opts.accountId ?? VEREIN, steps: [{ fn: "addBatch", typeId, root: ROOT, count: 2 }], summary: { title: "x", lines: [], orgName: null },
    status: opts.actionStatus ?? "awaiting_confirmation", preparedBy: OWNER, preparedVia: "dashboard", confirmedBy: null, txHash: null, error: null,
    preparedBlock: "100", createdAt: T0, expiresAt: "2026-11-24T10:00:00.000Z",
  });
  await store.insertBatchWithInvitations({ id: BATCH_ID, actionId: ACTION_ID, typeId, root: ROOT, count: 2, source: "people" }, [
    invitation("33333333-3333-4333-8333-333333333331", LEAF_A, ALICE, typeId),
    invitation("33333333-3333-4333-8333-333333333332", LEAF_B, null, typeId),
  ]);
  const delivered: string[] = [];
  const pushes: Parameters<Notifier["push"]>[0][] = [];
  const chainLogs: RegisterLog[] = [];
  const calls: { from: bigint; to: bigint }[] = [];
  let head = 1000n;
  const d: SyncDeps = {
    store,
    registry: REGISTRY,
    deployBlock: 100n,
    head: async () => head,
    getLogs: async (from, to) => {
      calls.push({ from, to });
      return chainLogs.filter((l) => l.blockNumber >= from && l.blockNumber <= to);
    },
    deliver: async (batchRowId) => {
      delivered.push(batchRowId);
    },
    notify: { push: async (p) => void pushes.push(p) },
  };
  return { d, store, delivered, pushes, chainLogs, calls, setHead: (h: bigint) => (head = h) };
}

const batchAdded = (typeId: Hex = TYPE, root: Hex = ROOT, block = 200n) =>
  log("BatchAdded", { batchId: 7n, typeId, issuer: OWNER, root, count: 2 }, block);

test("BatchAdded turns a prepared batch onchain, finishes its action and delivers once", async () => {
  const w = await world({ actionStatus: "submitted" });
  await applyRegisterLogs(w.d, [batchAdded()]);
  const b = await w.store.getBatch(BATCH_ID);
  assert.equal(b?.status, "onchain");
  assert.equal(b?.chainBatchId, "7");
  assert.equal((await w.store.getAction(ACTION_ID))?.status, "done");
  assert.deepEqual(w.delivered, [BATCH_ID]);
});

test("replaying the same logs changes nothing and delivers nothing", async () => {
  const w = await world();
  const logs = [batchAdded(), log("Claimed", { typeId: TYPE, account: ALICE, batchId: 7n, leaf: LEAF_A, validUntil: 0n })];
  await applyRegisterLogs(w.d, logs);
  const snapshot = JSON.stringify([[...w.store.batches.values()], [...w.store.invitations.values()], [...w.store.actions.values()]]);
  await applyRegisterLogs(w.d, logs);
  assert.equal(JSON.stringify([[...w.store.batches.values()], [...w.store.invitations.values()], [...w.store.actions.values()]]), snapshot);
  assert.deepEqual(w.delivered, [BATCH_ID]);
});

test("an action whose phone never reported is finished by the sync (found by root)", async () => {
  const w = await world();
  w.chainLogs.push(batchAdded(TYPE, ROOT, 500n));
  const r = await syncRegister(w.d);
  assert.ok(!("skipped" in r));
  assert.equal((await w.store.getAction(ACTION_ID))?.status, "done");
  assert.equal((await w.store.getBatch(BATCH_ID))?.status, "onchain");
  assert.deepEqual(w.delivered, [BATCH_ID]);
  // The next run sees nothing new and sends nothing.
  await syncRegister(w.d);
  assert.deepEqual(w.delivered, [BATCH_ID]);
});

test("an action already done or expired still has its batch turned onchain and delivered", async () => {
  for (const status of ["done", "expired", "failed"] as const) {
    const w = await world({ actionStatus: status });
    await applyRegisterLogs(w.d, [batchAdded()]);
    assert.equal((await w.store.getBatch(BATCH_ID))?.status, "onchain", status);
    assert.equal((await w.store.getAction(ACTION_ID))?.status, "done", status);
    assert.deepEqual(w.delivered, [BATCH_ID], status);
  }
});

test("two concurrent applyConfirmedAction calls with the same logs deliver once", async () => {
  const w = await world({ actionStatus: "submitted" });
  const logs = [batchAdded()];
  await Promise.all([applyConfirmedAction(w.d, ACTION_ID, logs), applyConfirmedAction(w.d, ACTION_ID, logs)]);
  assert.deepEqual(w.delivered, [BATCH_ID]);
  assert.equal((await w.store.getAction(ACTION_ID))?.status, "done");
});

test("a BatchAdded with an unknown root is ignored", async () => {
  const w = await world();
  const r = await applyRegisterLogs(w.d, [batchAdded(TYPE, keccak256(toHex("other")))]);
  assert.equal(r.applied, 1);
  assert.equal((await w.store.getBatch(BATCH_ID))?.status, "prepared");
  assert.equal((await w.store.getAction(ACTION_ID))?.status, "awaiting_confirmation");
  assert.deepEqual(w.delivered, []);
});

test("a BatchAdded whose root matches a batch of another type is ignored", async () => {
  const w = await world();
  await applyRegisterLogs(w.d, [batchAdded(FRAKTION_TYPE)]);
  assert.equal((await w.store.getBatch(BATCH_ID))?.status, "prepared");
  assert.deepEqual(w.delivered, []);
});

test("Claimed sets claimed_onchain; Renounced clears it and keeps the invitation accepted", async () => {
  const w = await world();
  await applyRegisterLogs(w.d, [batchAdded(), log("Claimed", { typeId: TYPE, account: BOB, batchId: 7n, leaf: LEAF_B, validUntil: 0n })]);
  let inv = (await w.store.listInvitations({ leafHash: LEAF_B }))[0];
  assert.equal(inv.claimedOnchain, true);
  assert.equal(inv.status, "accepted");
  assert.equal(inv.recipientWallet, BOB.toLowerCase());
  await applyRegisterLogs(w.d, [log("Renounced", { typeId: TYPE, account: BOB })]);
  inv = (await w.store.listInvitations({ leafHash: LEAF_B }))[0];
  assert.equal(inv.claimedOnchain, false);
  assert.equal(inv.status, "accepted");
  await applyRegisterLogs(w.d, [log("Claimed", { typeId: TYPE, account: BOB, batchId: 7n, leaf: LEAF_B, validUntil: 0n }), log("Pruned", { typeId: TYPE, account: BOB })]);
  inv = (await w.store.listInvitations({ leafHash: LEAF_B }))[0];
  assert.equal(inv.claimedOnchain, false);
});

test("LeafRevoked and BatchRevoked mark invitations revoked", async () => {
  const w = await world();
  await applyRegisterLogs(w.d, [batchAdded(), log("LeafRevoked", { batchId: 7n, leaf: LEAF_A })]);
  assert.equal((await w.store.listInvitations({ leafHash: LEAF_A }))[0].status, "revoked");
  assert.equal((await w.store.listInvitations({ leafHash: LEAF_B }))[0].status, "prepared");
  await applyRegisterLogs(w.d, [log("BatchRevoked", { batchId: 7n })]);
  assert.equal((await w.store.getBatch(BATCH_ID))?.status, "revoked");
  assert.equal((await w.store.listInvitations({ leafHash: LEAF_B }))[0].status, "revoked");
});

test("type events update the row; a type created outside the node gets a minimal row", async () => {
  const w = await world();
  const config = { metadataURI: "https://x/m", defaultValidity: 3600n, claimStart: 0n, claimEnd: 1800000000n, supplyCap: 5, publicClaim: false };
  await applyRegisterLogs(w.d, [
    log("TypeConfigured", { typeId: TYPE, config }),
    log("TypeRecognised", { typeId: TYPE, recognised: true }),
    log("TypeRebound", { typeId: TYPE, orgRegistry: OWNER, orgGeneration: 2n }),
  ]);
  let t = await w.store.getType(TYPE);
  assert.equal(t?.defaultValiditySeconds, 3600);
  assert.equal(t?.claimStart, null);
  assert.equal(t?.claimEnd, new Date(1800000000 * 1000).toISOString());
  assert.equal(t?.supplyCap, 5);
  assert.equal(t?.publicClaim, false);
  assert.equal(t?.recognised, true);
  await applyRegisterLogs(w.d, [log("TypeRecognised", { typeId: TYPE, recognised: false }), log("TypeRetired", { typeId: TYPE })]);
  t = await w.store.getType(TYPE);
  assert.equal(t?.recognised, false);
  assert.equal(t?.retired, true);

  const localId = keccak256(toHex("outside"));
  const orgId = orgIdFromUuid(VEREIN) as Hex;
  const outside = credentialTypeId(orgId, localId).toLowerCase() as Hex;
  await applyRegisterLogs(w.d, [log("TypeCreated", { typeId: outside, orgId, localId, kind: 2, policy: 1, orgGeneration: 1n })]);
  const row = await w.store.getType(outside);
  assert.equal(row?.accountId, VEREIN);
  assert.equal(row?.chainStatus, "onchain");
  assert.equal(row?.kind, "badge");
  assert.equal(row?.policy, "self_claim");
  assert.equal(row?.localUuid, null);
});

test("DelegateSet mirrors into credential_delegates and keeps the label", async () => {
  const w = await world();
  await w.store.setDelegate({ typeId: TYPE, delegate: BOB, label: "Kasse", active: false });
  await applyRegisterLogs(w.d, [log("DelegateSet", { typeId: TYPE, delegate: BOB, allowed: true })]);
  assert.deepEqual(await w.store.listDelegates(TYPE), [{ typeId: TYPE, delegate: BOB.toLowerCase(), label: "Kasse", active: true }]);
});

test("OrgPrivateOnlySet mirrors into credentials_members_public and pushes public members once on closing", async () => {
  const w = await world({ typeId: FRAKTION_TYPE, accountId: FRAKTION });
  const orgId = orgIdFromUuid(FRAKTION) as Hex;
  await applyRegisterLogs(w.d, [
    log("BatchAdded", { batchId: 7n, typeId: FRAKTION_TYPE, issuer: OWNER, root: ROOT, count: 2 }),
    log("Claimed", { typeId: FRAKTION_TYPE, account: ALICE, batchId: 7n, leaf: LEAF_A, validUntil: 0n }),
    log("OrgPrivateOnlySet", { orgId, privateOnly: false, by: OWNER }),
  ]);
  assert.equal((await w.store.getAccount(FRAKTION))?.membersPublicColumn, true);
  assert.equal(w.pushes.length, 0);

  const closing = log("OrgPrivateOnlySet", { orgId, privateOnly: true, by: OWNER });
  await Promise.all([applyRegisterLogs(w.d, [closing]), applyRegisterLogs(w.d, [closing])]);
  await applyRegisterLogs(w.d, [closing]);
  assert.equal((await w.store.getAccount(FRAKTION))?.membersPublicColumn, false);
  assert.equal(w.pushes.length, 1);
  const p = w.pushes[0];
  assert.deepEqual(p.wallets, [ALICE.toLowerCase()]);
  assert.equal(p.type, "credential_visibility");
  assert.equal(p.title, "Ausweis");
  assert.equal(p.body, "Diese Organisation zeigt ihre Mitglieder nicht mehr öffentlich. Du kannst deinen Ausweis privat machen.");
  assert.deepEqual(p.data, { type: "credential_visibility", typeId: FRAKTION_TYPE });
  assert.ok(!/Fraktion|Grün|Mitglied\b/.test(p.title + p.body));
});

test("the cursor advances only after apply; a throwing handler leaves it where it was", async () => {
  const w = await world();
  w.chainLogs.push(batchAdded(TYPE, ROOT, 300n));
  w.d.deliver = async () => {};
  const throwing: SyncDeps = {
    ...w.d,
    store: Object.assign(Object.create(Object.getPrototypeOf(w.store)), w.store, {
      updateBatch: async () => {
        throw new Error("db down");
      },
    }),
  };
  await assert.rejects(syncRegister(throwing), /db down/);
  assert.equal(await w.store.syncCursor(), null);
  const r = await syncRegister(w.d);
  assert.deepEqual(r, { from: 100n, to: 997n, applied: 1 });
  assert.deepEqual(await w.store.syncCursor(), { registry: REGISTRY.toLowerCase(), lastBlock: 997n });
});

test("a registry address different from the stored one skips with registry_mismatch", async () => {
  const w = await world();
  await w.store.setSyncCursor({ registry: "0x00000000000000000000000000000000000000c2", lastBlock: 500n });
  assert.deepEqual(await syncRegister(w.d), { skipped: "registry_mismatch" });
  assert.equal(w.calls.length, 0);
});

test("the window is capped at maxBlocks and stops three blocks before head", async () => {
  const w = await world();
  await w.store.setSyncCursor({ registry: REGISTRY, lastBlock: 199n });
  w.setHead(100_000n);
  assert.deepEqual(await syncRegister(w.d, { maxBlocks: 50n }), { from: 200n, to: 249n, applied: 0 });
  assert.deepEqual(w.calls, [{ from: 200n, to: 249n }]);
  w.setHead(260n);
  assert.deepEqual(await syncRegister(w.d, { maxBlocks: 50n }), { from: 250n, to: 257n, applied: 0 });
  assert.equal((await w.store.syncCursor())?.lastBlock, 257n);
  // Nothing new below head - 3: no call, cursor stays.
  const before = w.calls.length;
  const r = await syncRegister(w.d, { maxBlocks: 50n });
  assert.deepEqual(r, { from: 258n, to: 257n, applied: 0 });
  assert.equal(w.calls.length, before);
});

test("an unconfigured registry skips with not_configured", async () => {
  const w = await world();
  assert.deepEqual(await syncRegister({ ...w.d, registry: "" as Address }), { skipped: "not_configured" });
});

test("Claimed matches the invitation by leaf hash and the event's batch, not another batch with the same leaf", async () => {
  const w = await world();
  const OTHER_ROOT = keccak256(toHex("root-2"));
  const OTHER_BATCH = "22222222-2222-4222-8222-222222222223";
  const OTHER_INV = "33333333-3333-4333-8333-333333333339";
  await w.store.insertBatchWithInvitations({ id: OTHER_BATCH, actionId: null, typeId: TYPE, root: OTHER_ROOT, count: 1, source: "people" }, [invitation(OTHER_INV, LEAF_B, null)]);
  await applyRegisterLogs(w.d, [batchAdded(), log("BatchAdded", { batchId: 8n, typeId: TYPE, issuer: OWNER, root: OTHER_ROOT, count: 1 })]);
  await applyRegisterLogs(w.d, [log("Claimed", { typeId: TYPE, account: BOB, batchId: 8n, leaf: LEAF_B, validUntil: 0n })]);
  assert.equal((await w.store.getInvitation(OTHER_INV))?.status, "accepted");
  assert.equal((await w.store.getInvitation("33333333-3333-4333-8333-333333333332"))?.status, "prepared");
  // A Claimed for a batch the mirror does not know changes nothing.
  await applyRegisterLogs(w.d, [log("Claimed", { typeId: TYPE, account: ALICE, batchId: 99n, leaf: LEAF_A, validUntil: 0n })]);
  assert.equal((await w.store.getInvitation("33333333-3333-4333-8333-333333333331"))?.status, "prepared");
});

test("sweepUndelivered redelivers onchain batches that still hold prepared invitations, and only those", async () => {
  const w = await world();
  // The batch went on chain but delivery never ran (process died after the CAS).
  await w.store.updateBatch(BATCH_ID, { status: "onchain", chainBatchId: "7" });
  const PENDING_BATCH = "22222222-2222-4222-8222-222222222224";
  await w.store.insertBatchWithInvitations({ id: PENDING_BATCH, actionId: null, typeId: TYPE, root: keccak256(toHex("root-3")), count: 1, source: "people" }, [
    invitation("33333333-3333-4333-8333-33333333333a", keccak256(toHex("leaf-c")), ALICE),
  ]);
  const r = await sweepUndelivered(w.d);
  assert.deepEqual(r, { batches: 1, recovered: 0 });
  assert.deepEqual(w.delivered, [BATCH_ID]);
});

test("concurrent sweeps with the real delivery send each invitation once", async () => {
  const w = await world();
  await w.store.updateBatch(BATCH_ID, { status: "onchain", chainBatchId: "7" });
  const pushes: string[] = [];
  const deliveryDeps = { store: w.store, notify: { push: async (p: { data: Record<string, string> }) => void pushes.push(p.data.invitationId) }, mailer: null, now: () => Date.parse(T0) };
  w.d.deliver = async (id) => void (await deliverInvitations(deliveryDeps as never, id));
  await Promise.all([sweepUndelivered(w.d), sweepUndelivered(w.d), sweepUndelivered(w.d)]);
  assert.deepEqual(pushes, ["33333333-3333-4333-8333-333333333331"]);
  assert.equal((await w.store.getInvitation("33333333-3333-4333-8333-333333333332"))?.status, "invited");
  // Nothing left: the next sweep finds no batch.
  assert.deepEqual(await sweepUndelivered(w.d), { batches: 0, recovered: 0 });
});

test("a sweep keeps going when one batch's delivery throws", async () => {
  const w = await world();
  await w.store.updateBatch(BATCH_ID, { status: "onchain", chainBatchId: "7" });
  w.d.deliver = async () => {
    throw new Error("boom");
  };
  assert.deepEqual(await sweepUndelivered(w.d), { batches: 1, recovered: 0 });
});

test("the sweep hands interrupted mails back and redelivers them in the same run", async () => {
  const w = await world();
  await w.store.updateBatch(BATCH_ID, { status: "onchain", chainBatchId: "7" });
  const MAIL_INV = "33333333-3333-4333-8333-333333333332";
  // Account leaf already delivered; the claim-key leaf was taken for a mail 30 minutes ago and never sent.
  await w.store.updateInvitation("33333333-3333-4333-8333-333333333331", { status: "invited", invitedAt: T0 });
  await w.store.updateInvitation(MAIL_INV, { status: "invited", invitedAt: T0, contactEmail: "erika@example.org", mailAttempts: 1 });
  w.d.now = () => Date.parse(T0) + 30 * 60_000;
  const r = await sweepUndelivered(w.d);
  assert.deepEqual(r, { batches: 1, recovered: 1 });
  assert.deepEqual(w.delivered, [BATCH_ID]);
  assert.equal((await w.store.getInvitation(MAIL_INV))?.status, "prepared");
});
