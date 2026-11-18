import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import type { Address, Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import {
  attendeesOf,
  badgeWindow,
  eventBadgeGet,
  eventBadgesList,
  prepareEventBadge,
  prepareEventBadgeAuto,
  setupEventBadge,
  type EventBadgeDeps,
} from "../src/lib/credentials/event-badges";
import { applyRegisterLogs, type SyncDeps } from "../src/lib/credentials/sync";
import type { Caller } from "../src/lib/credentials/caller";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const NODE = "0x00000000000000000000000000000000000000dd" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const OTHER_ORG = "7a1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f71";
const EVENT = "11111111-2222-4333-8444-555555555555";
const OTHER_EVENT = "11111111-2222-4333-8444-666666666666";
const OWNER = "0x00000000000000000000000000000000000000a1";
const ADMIN = "0x00000000000000000000000000000000000000a2";
const MEMBER = "0x00000000000000000000000000000000000000a3";
const T0 = Date.parse("2026-12-05T20:00:00Z");
const wallet = (i: number) => `0x${(0xb000 + i).toString(16).padStart(40, "0")}`;

function world(opts: { node?: Address | null } = {}) {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedAccount({ id: OTHER_ORG, accountType: "organisation", name: "Anderer Verein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(VEREIN, OWNER, "owner");
  store.seedOwner(VEREIN, ADMIN, "admin");
  store.seedOwner(VEREIN, MEMBER, "member");
  store.seedEvent({ id: EVENT, title: "Sommerfest", date: "2026-12-05", endDate: null, imageUrl: "https://img.example/sommerfest.jpg", accountId: VEREIN });
  store.seedEvent({ id: OTHER_EVENT, title: "Anderes Fest", date: "2026-12-06", endDate: null, imageUrl: null, accountId: OTHER_ORG });
  store.seedRewardEvent({ id: "re-1", eventId: EVENT });
  store.seedRewardEvent({ id: "re-2", eventId: OTHER_EVENT });
  const d: EventBadgeDeps = {
    store,
    reader: { isOrgRegistered: async () => true, canManage: async () => true, orgPrivateOnly: async () => false, leafRevoked: async () => false } as never,
    receipt: async () => null,
    head: async () => 100n,
    notify: { push: async () => {} },
    now: () => T0,
    registry: REGISTRY,
    applyConfirmed: async () => {},
    badgeDelegate: () => (opts.node === undefined ? NODE : opts.node),
  };
  return { d, store };
}

const caller = (action: Caller["action"], who = OWNER): Caller => ({ ok: true, wallet: who, via: "chat_session", action, payload: {} });

/** Simulates the confirmation landing: type, batches and action on chain, invitations delivered. */
async function landAll(store: InMemoryCredentialStore) {
  for (const t of store.types.values()) if (t.eventId) await store.updateType(t.typeId, { chainStatus: "onchain" });
  let n = 1;
  for (const b of store.batches.values()) {
    if (b.status !== "prepared") continue;
    await store.updateBatch(b.id, { status: "onchain", chainBatchId: String(n++) });
    if (b.actionId) await store.updateAction(b.actionId, { status: "done" });
    for (const i of await store.listInvitations({ batchId: b.id })) await store.updateInvitation(i.id, { status: "invited" });
  }
}

test("attendees = checked-in tickets plus non-rejected event_attend claims, each wallet once", async () => {
  const { store } = world();
  store.seedTicket({ eventId: EVENT, wallet: wallet(1).toUpperCase().replace("0X", "0x"), status: "checked_in" });
  store.seedTicket({ eventId: EVENT, wallet: wallet(2), status: "checked_in" });
  store.seedTicket({ eventId: EVENT, wallet: wallet(6), status: "issued" }); // bought, never came
  store.seedRewardClaim({ wallet: wallet(2), action: "event_attend", referenceId: "re-1", status: "paid" });
  store.seedRewardClaim({ wallet: wallet(3), action: "event_attend", referenceId: "re-1", status: "paid" });
  store.seedRewardClaim({ wallet: wallet(4), action: "event_attend", referenceId: "re-1", status: "pending" });
  store.seedRewardClaim({ wallet: wallet(5), action: "event_attend", referenceId: "re-2", status: "paid" }); // other event
  store.seedRewardClaim({ wallet: wallet(7), action: "proposal_vote", referenceId: "re-1", status: "paid" }); // other action
  assert.deepEqual(await attendeesOf(store, EVENT), [
    { wallet: wallet(1), source: "ticket" },
    { wallet: wallet(2), source: "ticket" },
    { wallet: wallet(3), source: "qr" },
    { wallet: wallet(4), source: "qr" },
  ]);
});

test("refunded and void tickets and rejected claims never count", async () => {
  const { d, store } = world();
  store.seedTicket({ eventId: EVENT, wallet: wallet(7), status: "refunded" });
  store.seedTicket({ eventId: EVENT, wallet: wallet(8), status: "void" });
  store.seedRewardClaim({ wallet: wallet(9), action: "event_attend", referenceId: "re-1", status: "rejected" });
  store.seedTicket({ eventId: EVENT, wallet: "not-a-wallet", status: "checked_in" });
  assert.deepEqual(await attendeesOf(store, EVENT), []);

  store.seedTicket({ eventId: EVENT, wallet: wallet(1), status: "checked_in" });
  const r = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.count, 1);
  const subjects = [...store.invitations.values()].map((i) => i.recipientWallet);
  assert.deepEqual(subjects, [wallet(1)]);
});

test("the first tap creates the type and the batch in one action with createType before addBatch", async () => {
  const { d, store } = world();
  store.seedTicket({ eventId: EVENT, wallet: wallet(1), status: "checked_in" });
  store.seedRewardClaim({ wallet: wallet(2), action: "event_attend", referenceId: "re-1", status: "paid" });
  const r = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.count, 2);
  const a = (await store.getAction(r.data.actionId))!;
  assert.deepEqual(a.steps.map((s) => s.fn), ["createType", "addBatch"]);
  const create = a.steps[0] as { fn: "createType"; kind: string; localId: Hex; config: { publicClaim: boolean; claimStart: number; claimEnd: number } };
  assert.equal(create.kind, "badge");
  assert.equal(create.config.publicClaim, true);
  const w = badgeWindow({ date: "2026-12-05" });
  assert.equal(create.config.claimStart, w.claimStart);
  assert.equal(create.config.claimEnd, w.claimEnd);
  const add = a.steps[1] as { fn: "addBatch"; typeId: Hex; count: number };
  assert.equal(add.typeId, r.data.typeId);
  assert.equal(add.count, 2);
  assert.equal(a.summary.title, "2 Abzeichen vergeben: Dabei: Sommerfest");

  const t = (await store.getType(r.data.typeId))!;
  assert.equal(t.kind, "badge");
  assert.equal(t.template, "abzeichen");
  assert.equal(t.eventId, EVENT);
  assert.equal(t.name, "Dabei: Sommerfest");
  assert.equal(t.imageUrl, "https://img.example/sommerfest.jpg");
  assert.equal(t.chainStatus, "draft");
  assert.equal(t.localId, create.localId);
  const batches = await store.listBatches({ typeId: r.data.typeId });
  assert.deepEqual(batches.map((b) => [b.source, b.actionId]), [["event", r.data.actionId]]);

  // A long title is cut to 60 characters.
  const long = world();
  long.store.seedEvent({ id: EVENT, title: "x".repeat(80), date: "2026-12-05", endDate: null, imageUrl: null, accountId: VEREIN });
  long.store.seedTicket({ eventId: EVENT, wallet: wallet(1), status: "checked_in" });
  const lr = await prepareEventBadge(long.d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(lr.ok, true);
  if (lr.ok) assert.equal((await long.store.getType(lr.data.typeId))!.name.length, 60);
});

test("a second tap issues only latecomers; with none left it is 409 NOTHING_TO_ISSUE", async () => {
  const { d, store } = world();
  store.seedTicket({ eventId: EVENT, wallet: wallet(1), status: "checked_in" });
  store.seedTicket({ eventId: EVENT, wallet: wallet(2), status: "checked_in" });
  const first = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  // Tapped twice before the phone confirmed: nobody twice, and no second createType.
  const twice = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(twice.ok, false);
  if (!twice.ok) assert.equal(twice.status, 409);

  await landAll(store);
  // wallet(2) declined and wallet(1)'s invitation was revoked: neither gets a second badge.
  for (const i of store.invitations.values()) await store.updateInvitation(i.id, { status: i.recipientWallet === wallet(1) ? "revoked" : "declined" });

  store.seedRewardClaim({ wallet: wallet(10), action: "event_attend", referenceId: "re-1", status: "paid" });
  const second = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.data.count, 1);
  assert.equal(second.data.typeId, first.data.typeId);
  const a = (await store.getAction(second.data.actionId))!;
  assert.deepEqual(a.steps.map((s) => s.fn), ["addBatch"]);
  const latest = (await store.listInvitations({ batchId: (await store.listBatches({ actionId: second.data.actionId }))[0].id })).map((i) => i.recipientWallet);
  assert.deepEqual(latest, [wallet(10)]);

  await landAll(store);
  const third = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(third.ok, false);
  if (!third.ok) {
    assert.equal(third.code, "NOTHING_TO_ISSUE");
    assert.equal(third.message, "Alle Teilnehmenden haben ihr Abzeichen schon bekommen.");
  }

  const g = await eventBadgeGet(d, caller("event_badge_get"), { eventId: EVENT });
  assert.equal(g.ok, true);
  if (g.ok) assert.deepEqual({ attendees: g.data.attendees, notYetIssued: g.data.notYetIssued, issued: g.data.issued }, { attendees: 3, notYetIssued: 0, issued: 3 });
});

test("a discarded first tap frees the attendees again", async () => {
  const { d, store } = world();
  store.seedTicket({ eventId: EVENT, wallet: wallet(1), status: "checked_in" });
  const first = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  await store.updateAction(first.data.actionId, { status: "cancelled" });
  for (const b of await store.listBatches({ actionId: first.data.actionId })) await store.updateBatch(b.id, { status: "cancelled" });
  const again = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.data.count, 1);
  assert.deepEqual((await store.getAction(again.data.actionId))!.steps.map((s) => s.fn), ["createType", "addBatch"]);
});

test("badgeWindow: event day 00:00 Berlin to 14 days after the last day 23:59:59", () => {
  // Winter (CET, UTC+1).
  assert.deepEqual(badgeWindow({ date: "2026-12-05" }), {
    claimStart: Date.parse("2026-12-04T23:00:00Z") / 1000,
    claimEnd: Date.parse("2026-12-19T22:59:59Z") / 1000,
  });
  // A multi-day event counts from its last day; summer time (CEST, UTC+2).
  assert.deepEqual(badgeWindow({ date: "2026-07-10", end_date: "2026-07-12" }), {
    claimStart: Date.parse("2026-07-09T22:00:00Z") / 1000,
    claimEnd: Date.parse("2026-07-26T21:59:59Z") / 1000,
  });
  // A timestamp-like date uses its day.
  assert.equal(badgeWindow({ date: "2026-12-05T18:00:00+00:00" }).claimStart, Date.parse("2026-12-04T23:00:00Z") / 1000);
  // Across the switch to winter time (25 Oct 2026): start in CEST, end in CET.
  assert.deepEqual(badgeWindow({ date: "2026-10-20" }), {
    claimStart: Date.parse("2026-10-19T22:00:00Z") / 1000,
    claimEnd: Date.parse("2026-11-03T22:59:59Z") / 1000,
  });
});

test("only owners and admins of the event's org may prepare", async () => {
  const { d, store } = world();
  store.seedTicket({ eventId: EVENT, wallet: wallet(1), status: "checked_in" });
  for (const who of [MEMBER, wallet(99)]) {
    for (const r of [
      await prepareEventBadge(d, caller("event_badge_prepare", who), { eventId: EVENT }),
      await eventBadgeGet(d, caller("event_badge_get", who), { eventId: EVENT }),
      await setupEventBadge(d, caller("event_badge_setup", who), { eventId: EVENT, enabled: true }),
      await prepareEventBadgeAuto(d, caller("event_badge_auto", who), { eventId: EVENT, enabled: true }),
    ]) {
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.status, 403);
    }
  }
  // The owner of another org cannot touch this org's event.
  const otherOwner = wallet(77);
  store.seedOwner(OTHER_ORG, otherOwner, "owner");
  const foreign = await prepareEventBadge(d, caller("event_badge_prepare", otherOwner), { eventId: EVENT });
  assert.equal(foreign.ok, false);
  const unknown = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: "11111111-2222-4333-8444-999999999999" });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.status, 404);

  const admin = await prepareEventBadge(d, caller("event_badge_prepare", ADMIN), { eventId: EVENT });
  assert.equal(admin.ok, true);
  const list = await eventBadgesList(d, caller("event_badges_list", ADMIN), { accountId: VEREIN });
  assert.equal(list.ok, true);
  if (list.ok) {
    assert.deepEqual(list.data.map((e) => [e.eventId, e.title, e.attendees, e.badge?.chain]), [[EVENT, "Sommerfest", 1, "draft"]]);
  }
});

test("turning auto off clears auto_badges at once and prepares setDelegate(false)", async () => {
  const { d, store } = world();
  store.seedTicket({ eventId: EVENT, wallet: wallet(1), status: "checked_in" });
  const first = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  // Not on chain yet: no delegate.
  const early = await prepareEventBadgeAuto(d, caller("event_badge_auto"), { eventId: EVENT, enabled: true });
  assert.equal(early.ok, false);
  if (!early.ok) assert.equal(early.code, "TYPE_NOT_ON_CHAIN");
  await landAll(store);
  const typeId = first.data.typeId;

  const on = await prepareEventBadgeAuto(d, caller("event_badge_auto"), { eventId: EVENT, enabled: true });
  assert.equal(on.ok, true);
  if (!on.ok) return;
  const onAction = (await store.getAction(on.data.actionId))!;
  assert.deepEqual(onAction.steps, [{ fn: "setDelegate", typeId, delegate: NODE, allowed: true }]);
  assert.deepEqual((await store.listDelegates(typeId)).map((x) => x.label), ["Röbel-Server (sofortige Abzeichen)"]);
  assert.ok(!JSON.stringify(onAction.summary).includes(NODE));
  // auto_badges waits for the chain ...
  assert.equal((await store.getType(typeId))!.autoBadges ?? false, false);
  // ... and the sync turns it on when it sees DelegateSet for the node key.
  const sync = { store, badgeDelegate: NODE } as unknown as SyncDeps;
  await applyRegisterLogs(sync, [{ eventName: "DelegateSet", args: { typeId, delegate: NODE, allowed: true }, blockNumber: 200n, logIndex: 0 }]);
  assert.equal((await store.getType(typeId))!.autoBadges, true);

  const off = await prepareEventBadgeAuto(d, caller("event_badge_auto"), { eventId: EVENT, enabled: false });
  assert.equal(off.ok, true);
  if (!off.ok) return;
  assert.equal((await store.getType(typeId))!.autoBadges, false);
  assert.deepEqual((await store.getAction(off.data.actionId))!.steps, [{ fn: "setDelegate", typeId, delegate: NODE, allowed: false }]);

  // The sync seeing the removal keeps it off; a DelegateSet for another key changes nothing.
  await store.updateType(typeId, { autoBadges: true });
  await applyRegisterLogs(sync, [{ eventName: "DelegateSet", args: { typeId, delegate: NODE, allowed: false }, blockNumber: 201n, logIndex: 0 }]);
  assert.equal((await store.getType(typeId))!.autoBadges, false);
  await applyRegisterLogs(sync, [{ eventName: "DelegateSet", args: { typeId, delegate: wallet(5), allowed: true }, blockNumber: 202n, logIndex: 0 }]);
  assert.equal((await store.getType(typeId))!.autoBadges, false);

  const unconfigured = world({ node: null });
  const nc = await prepareEventBadgeAuto(unconfigured.d, caller("event_badge_auto"), { eventId: EVENT, enabled: true });
  assert.equal(nc.ok, false);
  if (!nc.ok) assert.deepEqual([nc.status, nc.code], [503, "NOT_CONFIGURED"]);
});

test("a second badge type for the same event is refused by the store", async () => {
  const { store } = world();
  const row = (typeId: string, extra: Partial<TypeRow> = {}): TypeRow => ({
    typeId: typeId as Hex, registry: REGISTRY, accountId: VEREIN, orgId: orgIdFromUuid(VEREIN) as Hex, localUuid: null,
    localId: typeId as Hex, kind: "badge", policy: "issuer_batch", name: "Dabei", description: null, imageUrl: null, benefits: [],
    template: "abzeichen", defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0, publicClaim: true,
    recognised: false, retired: false, chainStatus: "draft", eventId: EVENT, createdBy: OWNER, createdAt: new Date(T0).toISOString(), ...extra,
  });
  await store.upsertType(row(`0x${"01".repeat(32)}`));
  await assert.rejects(store.upsertType(row(`0x${"02".repeat(32)}`)), (e: { code?: string }) => e.code === "23505");
  // Re-saving the same type is fine; a retired one or a non-badge type does not block.
  await store.upsertType(row(`0x${"01".repeat(32)}`, { name: "Neu" }));
  await store.upsertType(row(`0x${"03".repeat(32)}`, { kind: "membership" }));
  await store.updateType(`0x${"01".repeat(32)}`, { retired: true });
  await store.upsertType(row(`0x${"04".repeat(32)}`));

  // The migration declares the same rule for Postgres.
  const sql = readFileSync(new URL("../../../supabase/migrations/20261117crb_credential_event_badges.sql", import.meta.url), "utf8");
  assert.match(sql, /create unique index if not exists credential_types_event_badge_uq\s+on public\.credential_types \(event_id\)\s+where kind = 'badge' and event_id is not null and not retired/i);
  assert.match(sql, /add column if not exists auto_badges boolean not null default false/i);
  assert.match(sql, /add column if not exists last_auto_at timestamptz/i);
  assert.match(sql, /credentials_badge_delegate_enabled/);
});

test("event_badge_setup stores a draft with name, poster image and limit, and the first prepare puts it on chain", async () => {
  const { d, store } = world();
  const s = await setupEventBadge(d, caller("event_badge_setup"), {
    eventId: EVENT,
    enabled: true,
    name: "Sommerfest-Stempel",
    imageUrl: "https://img.example/stempel.png",
    supplyCap: 300,
  });
  assert.equal(s.ok, true);
  if (!s.ok || !s.data.typeId) return;
  const typeId = s.data.typeId;
  assert.equal(store.actions.size, 0, "setup prepares no chain step");
  const t = (await store.getType(typeId))!;
  assert.deepEqual([t.name, t.imageUrl, t.supplyCap, t.chainStatus, t.kind, t.eventId], ["Sommerfest-Stempel", "https://img.example/stempel.png", 300, "draft", "badge", EVENT]);

  // Saving the event again updates the same draft.
  const s2 = await setupEventBadge(d, caller("event_badge_setup"), { eventId: EVENT, enabled: true, name: "Sommerfest 2026" });
  assert.equal(s2.ok && s2.data.typeId, typeId);
  assert.equal((await store.getType(typeId))!.name, "Sommerfest 2026");
  const bad = await setupEventBadge(d, caller("event_badge_setup"), { eventId: EVENT, enabled: true, supplyCap: -1 });
  assert.equal(bad.ok, false);

  store.seedTicket({ eventId: EVENT, wallet: wallet(1), status: "checked_in" });
  const r = await prepareEventBadge(d, caller("event_badge_prepare"), { eventId: EVENT });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.typeId, typeId);
  const create = (await store.getAction(r.data.actionId))!.steps[0] as { fn: string; config: { supplyCap: number } };
  assert.equal(create.fn, "createType");
  assert.equal(create.config.supplyCap, 300);

  // Switching the badge off before it is on chain retires the draft; switching on again starts fresh.
  const off = await setupEventBadge(d, caller("event_badge_setup"), { eventId: EVENT, enabled: false });
  assert.deepEqual(off.ok && off.data, { typeId: null });
  assert.equal((await store.getType(typeId))!.retired, true);
  const again = await setupEventBadge(d, caller("event_badge_setup"), { eventId: EVENT, enabled: true });
  assert.equal(again.ok, true);
  if (again.ok) assert.notEqual(again.data.typeId, typeId);

  // On chain, switching off prepares retireType.
  await landAll(store);
  const live = [...store.types.values()].find((x) => x.eventId === EVENT && !x.retired)!;
  await store.updateType(live.typeId, { chainStatus: "onchain" });
  const offLive = await setupEventBadge(d, caller("event_badge_setup"), { eventId: EVENT, enabled: false });
  assert.equal(offLive.ok, true);
  if (offLive.ok) {
    assert.ok(offLive.data.actionId);
    assert.deepEqual((await store.getAction(offLive.data.actionId!))!.steps, [{ fn: "retireType", typeId: live.typeId }]);
  }
});
