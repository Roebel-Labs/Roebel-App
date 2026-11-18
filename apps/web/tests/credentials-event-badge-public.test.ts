import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Address } from "viem";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import { badgeWindow, prepareEventBadge, publicEventBadge, type EventBadgeDeps } from "../src/lib/credentials/event-badges";
import type { Caller } from "../src/lib/credentials/caller";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const EVENT = "11111111-2222-4333-8444-555555555555";
const BARE = "11111111-2222-4333-8444-666666666666";
const OWNER = "0x00000000000000000000000000000000000000a1";
const wallet = (i: number) => `0x${(0xb000 + i).toString(16).padStart(40, "0")}`;

test("public badge route returns name, image, window and count, and null for events without a badge", async () => {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(VEREIN, OWNER, "owner");
  store.seedEvent({ id: EVENT, title: "Sommerfest", date: "2026-12-05", endDate: null, imageUrl: "https://img.example/s.jpg", accountId: VEREIN });
  store.seedEvent({ id: BARE, title: "Ohne", date: "2026-12-06", endDate: null, imageUrl: null, accountId: VEREIN });
  for (let i = 1; i <= 3; i++) store.seedTicket({ eventId: EVENT, wallet: wallet(i), status: "checked_in" });
  const d: EventBadgeDeps = {
    store,
    reader: { isOrgRegistered: async () => true, canManage: async () => true, orgPrivateOnly: async () => false, leafRevoked: async () => false } as never,
    receipt: async () => null,
    head: async () => 1n,
    notify: { push: async () => {} },
    now: () => Date.parse("2026-12-05T20:00:00Z"),
    registry: "0x00000000000000000000000000000000000000c1" as Address,
    applyConfirmed: async () => {},
  };
  const c: Caller = { ok: true, wallet: OWNER, via: "signature", action: "event_badge_prepare", payload: {} };
  const r = await prepareEventBadge(d, c, { eventId: EVENT });
  assert.equal(r.ok, true);
  // Two accepted, one only invited.
  let n = 0;
  for (const i of store.invitations.values()) await store.updateInvitation(i.id, { status: n++ < 2 ? "accepted" : "invited" });

  const w = badgeWindow({ date: "2026-12-05" });
  const got = await publicEventBadge(store, EVENT);
  const typeId = got.badge?.typeId;
  assert.match(String(typeId), /^0x[0-9a-f]{64}$/);
  assert.deepEqual(got, { badge: { typeId, name: "Dabei: Sommerfest", imageUrl: "https://img.example/s.jpg", claimStart: w.claimStart, claimEnd: w.claimEnd, collected: 2 } });
  // No names, no wallets anywhere in the answer (the 32-byte type id is not an account).
  assert.ok(!/"0x[0-9a-f]{40}"/i.test(JSON.stringify(got)));

  assert.deepEqual(await publicEventBadge(store, BARE), { badge: null });
  assert.deepEqual(await publicEventBadge(store, "11111111-2222-4333-8444-999999999999"), { badge: null });
  assert.deepEqual(await publicEventBadge(store, "not-a-uuid"), { badge: null });
});

test("event_badge_qr reuses the linked Smart Event QR or creates it for a published event, owners and admins only", async () => {
  const { ensureEventQr } = await import("../src/lib/credentials/event-badges");
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(VEREIN, OWNER, "owner");
  store.seedEvent({ id: EVENT, title: "Sommerfest", date: "2026-12-05", endDate: null, imageUrl: null, accountId: VEREIN, status: "approved", time: "18:00" });
  store.seedEvent({ id: BARE, title: "Entwurf", date: "2026-12-06", endDate: null, imageUrl: null, accountId: VEREIN, status: "pending" });
  const d = { store, now: () => Date.parse("2026-12-05T10:00:00Z") } as unknown as EventBadgeDeps;
  const c = (wallet: string): Caller => ({ ok: true, wallet, via: "signature", action: "event_badge_qr", payload: {} });

  const first = await ensureEventQr(d, c(OWNER), { eventId: EVENT });
  assert.equal(first.ok, true);
  const id = first.ok ? first.data.rewardEventId : "";
  assert.ok(id);
  assert.equal(store.rewardEvents.length, 1);
  assert.equal(store.rewardEvents[0].eventId, EVENT);
  // Idempotent: the second call returns the same QR and creates nothing.
  const again = await ensureEventQr(d, c(OWNER), { eventId: EVENT });
  assert.deepEqual(again, { ok: true, data: { rewardEventId: id } });
  assert.equal(store.rewardEvents.length, 1);

  const draft = await ensureEventQr(d, c(OWNER), { eventId: BARE });
  assert.equal(draft.ok, false);
  assert.equal(draft.ok ? "" : draft.code, "NOT_PUBLISHED");

  const stranger = await ensureEventQr(d, c(wallet(9)), { eventId: EVENT });
  assert.equal(stranger.ok, false);
  assert.equal(stranger.ok ? 0 : stranger.status, 403);
});
