import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { CREDENTIAL_REGISTRY_ABI } from "@netizen-labs/credential-registry";
import { decodeFunctionData, type Address, type Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import {
  AUTO_MAX_RECIPIENTS,
  eventTimes,
  inAutoWindow,
  nudgeAutoBadges,
  runAutoBadges,
  type AutoDeps,
} from "../src/lib/credentials/badge-delegate";
import type { Caller } from "../src/lib/credentials/caller";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const NODE = "0x00000000000000000000000000000000000000dd" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const EVENT = "11111111-2222-4333-8444-555555555555";
const TYPE = `0x${"ab".repeat(32)}` as Hex;
// The event runs 2026-12-05 18:00–23:00 Berlin (CET, UTC+1): 17:00Z–22:00Z.
const START = Date.parse("2026-12-05T17:00:00Z");
const END = Date.parse("2026-12-05T22:00:00Z");
const DURING = Date.parse("2026-12-05T19:00:00Z");
const wallet = (i: number) => `0x${(0xb000 + i).toString(16).padStart(40, "0")}`;

type Sent = { to: Address; data: Hex };

function world(opts: { delegate?: boolean; killed?: boolean; balance?: bigint; now?: number } = {}) {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedEvent({ id: EVENT, title: "Sommerfest", date: "2026-12-05", time: "18:00", endTime: "23:00", endDate: null, imageUrl: null, accountId: VEREIN });
  store.seedRewardEvent({ id: "re-1", eventId: EVENT });
  const row: TypeRow = {
    typeId: TYPE, registry: REGISTRY, accountId: VEREIN, orgId: orgIdFromUuid(VEREIN).toLowerCase() as Hex, localUuid: null,
    localId: TYPE, kind: "badge", policy: "issuer_batch", name: "Dabei: Sommerfest", description: null, imageUrl: null, benefits: [],
    template: "abzeichen", defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0, publicClaim: true,
    recognised: false, retired: false, chainStatus: "onchain", eventId: EVENT, createdBy: wallet(0), createdAt: new Date(START).toISOString(),
    autoBadges: true, lastAutoAt: null,
  };
  void store.upsertType(row);
  const sent: Sent[] = [];
  const state = { delegate: opts.delegate ?? true, killed: opts.killed ?? false, balance: opts.balance ?? 10n ** 18n, now: opts.now ?? DURING };
  const d: AutoDeps = {
    store,
    reader: { isDelegate: async (typeId: Hex, account: Address) => state.delegate && typeId === TYPE && account === NODE },
    send: async (call) => {
      sent.push(call);
      return `0x${sent.length.toString(16).padStart(64, "0")}` as Hex;
    },
    balance: async () => state.balance,
    killSwitch: async () => state.killed,
    now: () => state.now,
    registry: REGISTRY,
    minBalanceWei: 10n ** 16n,
    node: NODE,
  };
  return { d, store, sent, state };
}

/** What the sync does when BatchAdded arrives: the batch is on chain, invitations delivered. */
async function land(store: InMemoryCredentialStore) {
  for (const b of store.batches.values()) {
    if (b.status !== "prepared") continue;
    await store.updateBatch(b.id, { status: "onchain", chainBatchId: String(store.batches.size) });
    if (b.actionId) await store.updateAction(b.actionId, { status: "done" });
    for (const i of await store.listInvitations({ batchId: b.id })) await store.updateInvitation(i.id, { status: "invited" });
  }
}

function attend(store: InMemoryCredentialStore, from: number, to: number) {
  for (let i = from; i < to; i++) store.seedTicket({ eventId: EVENT, wallet: wallet(i), status: "checked_in" });
}

/** Every call the node key ever made: only addBatch, only to the registry. */
function assertOnlyAddBatch(sent: Sent[]) {
  for (const s of sent) {
    assert.equal(s.to, REGISTRY);
    assert.equal(decodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, data: s.data }).functionName, "addBatch");
  }
}

const caller = (who: string): Caller => ({ ok: true, wallet: who, via: "signature", action: "badge_nudge", payload: {} });

test("issues one batch for new attendees inside the window and records it as node_delegate", async () => {
  const { d, store, sent } = world();
  attend(store, 1, 4);
  store.seedTicket({ eventId: EVENT, wallet: wallet(9), status: "refunded" });
  const r = await runAutoBadges(d);
  assert.deepEqual(r, [{ type: TYPE, issued: 3 }]);
  assert.equal(sent.length, 1);
  const [batch] = await store.listBatches({ typeId: TYPE });
  assert.equal(batch.source, "node_delegate");
  assert.equal(batch.status, "prepared");
  assert.equal(batch.count, 3);
  const a = (await store.getAction(batch.actionId!))!;
  assert.equal(a.preparedVia, "node");
  assert.equal(a.status, "submitted");
  assert.equal(a.txHash, `0x${"1".padStart(64, "0")}`);
  assert.deepEqual(a.steps, [{ fn: "addBatch", typeId: TYPE, root: batch.root, count: 3 }]);
  assert.ok(!JSON.stringify(a.summary).includes(NODE));
  const decoded = decodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, data: sent[0].data });
  assert.deepEqual(decoded.args, [TYPE, batch.root, 3]);
  assert.equal((await store.getType(TYPE))!.lastAutoAt, new Date(DURING).toISOString());
  const recipients = (await store.listInvitations({ batchId: batch.id })).map((i) => i.recipientWallet).sort();
  assert.deepEqual(recipients, [wallet(1), wallet(2), wallet(3)]);
});

test("does nothing outside the window, with the kill switch on, or below the balance floor", async () => {
  // The window: one hour before the start until six hours after the end.
  const ev = { starts: START / 1000, ends: END / 1000 };
  assert.equal(inAutoWindow(ev, ev.starts - 3601), false);
  assert.equal(inAutoWindow(ev, ev.starts - 3600), true);
  assert.equal(inAutoWindow(ev, ev.ends + 6 * 3600), true);
  assert.equal(inAutoWindow(ev, ev.ends + 6 * 3600 + 1), false);
  assert.deepEqual(eventTimes({ date: "2026-12-05", time: "18:00", endTime: "23:00" }), ev);
  // Without times the event covers its whole day (Berlin).
  assert.deepEqual(eventTimes({ date: "2026-12-05" }), { starts: Date.parse("2026-12-04T23:00:00Z") / 1000, ends: Date.parse("2026-12-05T22:59:59Z") / 1000 });
  // An end time after midnight belongs to the next day.
  assert.equal(eventTimes({ date: "2026-12-05", time: "22:00", endTime: "02:00" }).ends, Date.parse("2026-12-06T01:00:00Z") / 1000);

  for (const [opts, skipped] of [
    [{ now: START - 2 * 3600_000 }, "window"],
    [{ now: END + 7 * 3600_000 }, "window"],
    [{ killed: true }, "kill_switch"],
    [{ balance: 10n ** 15n }, "low_balance"],
  ] as const) {
    const { d, store, sent } = world(opts);
    attend(store, 1, 3);
    assert.deepEqual(await runAutoBadges(d), [{ type: TYPE, issued: 0, skipped }]);
    assert.equal(sent.length, 0);
    assert.equal(store.batches.size, 0);
    assert.equal((await store.getType(TYPE))!.autoBadges, true);
  }
  // Nobody new.
  const { d } = world();
  assert.deepEqual(await runAutoBadges(d), [{ type: TYPE, issued: 0, skipped: "nothing_new" }]);
});

test("stops and clears auto_badges when the org removed the delegate on chain", async () => {
  const { d, store, sent } = world({ delegate: false });
  attend(store, 1, 3);
  assert.deepEqual(await runAutoBadges(d), [{ type: TYPE, issued: 0, skipped: "not_delegate" }]);
  assert.equal(sent.length, 0);
  assert.equal((await store.getType(TYPE))!.autoBadges, false);
  // Next run: the type is no longer auto at all.
  assert.deepEqual(await runAutoBadges(d), []);
});

test("waits while its previous batch is not yet on chain", async () => {
  const { d, store, sent, state } = world();
  attend(store, 1, 3);
  assert.deepEqual(await runAutoBadges(d), [{ type: TYPE, issued: 2 }]);
  attend(store, 3, 4);
  // Past the run slot (RUN_LOCK_MS): it is the unlanded batch that holds this run back.
  state.now += 31_000;
  assert.deepEqual(await runAutoBadges(d), [{ type: TYPE, issued: 0, skipped: "pending_batch" }]);
  assert.equal(sent.length, 1);
  await land(store);
  state.now += 31_000;
  // Only the latecomer: the first two already have their invitation.
  assert.deepEqual(await runAutoBadges(d), [{ type: TYPE, issued: 1 }]);
  const latest = [...store.batches.values()].at(-1)!;
  assert.deepEqual((await store.listInvitations({ batchId: latest.id })).map((i) => i.recipientWallet), [wallet(3)]);


  // A node batch that never landed until its action expired is given up, and its people are freed.
  const w = world({ now: DURING });
  attend(w.store, 1, 2);
  await runAutoBadges(w.d);
  w.state.now = DURING + 8 * 24 * 3600_000;
  // Keep the event "running" eight days later by moving it (the window has its own test).
  w.store.events.get(EVENT)!.date = "2026-12-13";
  const after = await runAutoBadges(w.d);
  assert.deepEqual(after, [{ type: TYPE, issued: 1 }]);
  const [old, fresh] = [...w.store.batches.values()];
  assert.equal(old.status, "cancelled");
  assert.equal((await w.store.getAction(old.actionId!))!.status, "failed");
  assert.equal(fresh.status, "prepared");
});

test("caps a batch at 500 and takes the rest next run", async () => {
  assert.equal(AUTO_MAX_RECIPIENTS, 500);
  const { d, store, state } = world();
  attend(store, 1, 502);
  assert.deepEqual(await runAutoBadges(d), [{ type: TYPE, issued: 500 }]);
  await land(store);
  state.now += 31_000;
  assert.deepEqual(await runAutoBadges(d), [{ type: TYPE, issued: 1 }]);
  const all = (await store.listInvitations({ typeId: TYPE })).map((i) => i.recipientWallet);
  assert.equal(new Set(all).size, 501);
});

test("only ever sends addBatch to the registry address", async () => {
  const { d, store, sent, state } = world();
  attend(store, 1, 5);
  await runAutoBadges(d);
  await land(store);
  attend(store, 5, 7);
  state.now += 31_000;
  await runAutoBadges(d);
  await land(store);
  state.now += 61_000;
  attend(store, 7, 8);
  await nudgeAutoBadges(d, caller(wallet(7)), { eventId: EVENT });
  assert.equal(sent.length, 3);
  assertOnlyAddBatch(sent);
});

test("badge_nudge runs at most once per type per 60 s and only for an attendee", async () => {
  const { d, store, sent, state } = world();
  attend(store, 1, 3);
  // Not an attendee.
  const stranger = await nudgeAutoBadges(d, caller(wallet(50)), { eventId: EVENT });
  assert.deepEqual(stranger, { ok: true, data: { ran: false } });
  assert.equal(sent.length, 0);
  // An attendee: runs.
  const first = await nudgeAutoBadges(d, caller(wallet(1).toUpperCase().replace("0X", "0x")), { eventId: EVENT });
  assert.deepEqual(first, { ok: true, data: { ran: true } });
  assert.equal(sent.length, 1);
  await land(store);
  attend(store, 3, 4);
  // Within 60 s: no second run, even for another attendee.
  state.now += 30_000;
  assert.deepEqual(await nudgeAutoBadges(d, caller(wallet(3)), { eventId: EVENT }), { ok: true, data: { ran: false } });
  assert.equal(sent.length, 1);
  // After 60 s: runs again.
  state.now += 31_000;
  assert.deepEqual(await nudgeAutoBadges(d, caller(wallet(3)), { eventId: EVENT }), { ok: true, data: { ran: true } });
  assert.equal(sent.length, 2);
  // Auto off: never.
  await store.updateType(TYPE, { autoBadges: false });
  state.now += 120_000;
  assert.deepEqual(await nudgeAutoBadges(d, caller(wallet(1)), { eventId: EVENT }), { ok: true, data: { ran: false } });
  // A bad event id is refused.
  const bad = await nudgeAutoBadges(d, caller(wallet(1)), { eventId: "nope" });
  assert.equal(bad.ok, false);
});

test("cron and nudge running at the same time issue one batch, never two", async () => {
  const { d, store, sent } = world();
  attend(store, 1, 4);
  // A slow send keeps the first run open while the second one starts.
  const realSend = d.send;
  d.send = async (call) => {
    await new Promise((r) => setTimeout(r, 20));
    return realSend(call);
  };
  const [cron, nudge] = await Promise.all([runAutoBadges(d), nudgeAutoBadges(d, caller(wallet(1)), { eventId: EVENT })]);
  assert.equal(sent.length, 1);
  const batches = [...store.batches.values()].filter((b) => b.source === "node_delegate");
  assert.equal(batches.length, 1);
  const issued = cron.reduce((n, r) => n + r.issued, 0);
  assert.ok(issued === 3 || (nudge.ok && nudge.data.ran));
  // Two cron passes at once: also one batch.
  const w2 = world();
  attend(w2.store, 1, 3);
  await Promise.all([runAutoBadges(w2.d), runAutoBadges(w2.d)]);
  assert.equal(w2.sent.length, 1);
});

test("a failed send stores a fixed text for the admins, never the raw error", async () => {
  const { d, store } = world();
  attend(store, 1, 3);
  d.send = async () => {
    throw new Error("HTTP request failed. URL: https://rpc.example/v1/SECRETKEY Details: from 0x00000000000000000000000000000000000000dd");
  };
  await runAutoBadges(d);
  const [a] = [...store.actions.values()];
  assert.equal(a.status, "failed");
  assert.equal(a.error, "Senden fehlgeschlagen");
});
