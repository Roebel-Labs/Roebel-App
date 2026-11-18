import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId } from "@netizen-labs/credential-registry";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import { mine, type HolderDeps } from "../src/lib/credentials/holder";
import type { Caller } from "../src/lib/credentials/caller";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const FEST = "11111111-2222-4333-8444-555555555551";
const LAUF = "11111111-2222-4333-8444-555555555552";
const KONZERT = "11111111-2222-4333-8444-555555555553";
const PLAIN = "11111111-2222-4333-8444-555555555554";
const QR_LAUF = "22222222-2222-4333-8444-555555555552";
const ALICE = "0x00000000000000000000000000000000000000b1";
const BOB = "0x00000000000000000000000000000000000000b2";
const T0 = Date.parse("2026-12-20T10:00:00Z");

const typeIdOf = (local: string) => credentialTypeId(orgIdFromUuid(VEREIN) as Hex, keccak256(toHex(local))).toLowerCase() as Hex;

function badgeType(local: string, eventId: string, name: string, chainStatus: TypeRow["chainStatus"]): TypeRow {
  return {
    typeId: typeIdOf(local), registry: REGISTRY, accountId: VEREIN, orgId: orgIdFromUuid(VEREIN).toLowerCase() as Hex, localUuid: null, localId: keccak256(toHex(local)),
    kind: "badge", policy: "issuer_batch", name, description: null, imageUrl: `https://img.example/${local}.png`, benefits: [], template: "abzeichen",
    defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0, publicClaim: true, recognised: false, retired: false,
    chainStatus, eventId, createdBy: ALICE, createdAt: new Date(T0).toISOString(),
  };
}

const caller = (wallet: string): Caller => ({ ok: true, wallet, via: "signature", action: "mine", payload: {} });

async function world() {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedEvent({ id: FEST, title: "Sommerfest", date: "2026-12-05", endDate: null, imageUrl: null, accountId: VEREIN });
  store.seedEvent({ id: LAUF, title: "Stadtlauf", date: "2026-12-12", endDate: null, imageUrl: null, accountId: VEREIN });
  store.seedEvent({ id: KONZERT, title: "Konzert", date: "2026-12-14", endDate: null, imageUrl: null, accountId: VEREIN });
  store.seedEvent({ id: PLAIN, title: "Ohne Abzeichen", date: "2026-12-15", endDate: null, imageUrl: null, accountId: VEREIN });
  const fest = badgeType("fest", FEST, "Dabei: Sommerfest", "onchain");
  const lauf = badgeType("lauf", LAUF, "Dabei: Stadtlauf", "draft");
  const konzert = badgeType("konzert", KONZERT, "Dabei: Konzert", "onchain");
  for (const t of [fest, lauf, konzert]) await store.upsertType(t);
  const d: HolderDeps = {
    store,
    reader: { orgPrivateOnly: async () => false, holdsMany: async (ids: readonly Hex[]) => ids.map(() => false) } as never,
    registry: REGISTRY,
    now: () => T0,
  };
  return { store, d, fest, lauf, konzert };
}

async function invite(store: InMemoryCredentialStore, typeId: Hex, wallet: string) {
  const id = `44444444-4444-4444-8444-${randomBytes(6).toString("hex")}`;
  const batchId = `55555555-4444-4444-8444-${randomBytes(6).toString("hex")}`;
  await store.insertBatchWithInvitations(
    { id: batchId, actionId: null, typeId, root: keccak256(toHex(batchId)), count: 1, source: "event" },
    [{
      id, typeId, leafKind: "account", subject: wallet, validUntil: "0", salt: keccak256(toHex(id)), leafHash: keccak256(toHex(`l-${id}`)),
      proof: [], claimKeyEnc: null, tokenHash: null, tokenEnc: null, recipientWallet: wallet, displayName: null, contactEmail: null, status: "invited",
    }],
  );
  await store.updateBatch(batchId, { status: "onchain", chainBatchId: String(Math.floor(Math.random() * 1e6)) });
}

const ok = <T>(r: { ok: true; data: T } | { ok: false }): T => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; data: T }).data;
};

test("pendingBadges lists attended events with a badge type and no invitation yet", async () => {
  const w = await world();
  w.store.seedTicket({ eventId: FEST, wallet: ALICE.toUpperCase().replace("0X", "0x"), status: "checked_in" });
  w.store.seedRewardEvent({ id: QR_LAUF, eventId: LAUF });
  w.store.seedRewardClaim({ wallet: ALICE, action: "event_attend", referenceId: QR_LAUF, status: "paid" });
  // Attended an event without a badge type: never pending.
  w.store.seedTicket({ eventId: PLAIN, wallet: ALICE, status: "checked_in" });

  const r = ok(await mine(w.d, caller(ALICE)));
  assert.deepEqual(r.invitations, []);
  const byEvent = Object.fromEntries(r.pendingBadges.map((p) => [p.eventId, p]));
  assert.deepEqual(Object.keys(byEvent).sort(), [FEST, LAUF].sort());
  assert.deepEqual(byEvent[FEST], {
    eventId: FEST, eventTitle: "Sommerfest", eventDate: "2026-12-05", orgName: "Heimatverein", typeId: w.fest.typeId,
    name: "Dabei: Sommerfest", imageUrl: "https://img.example/fest.png", state: "waiting_for_issue",
  });
  // A draft type has no id in the register yet.
  assert.equal(byEvent[LAUF].typeId, null);
  // Newest event first.
  assert.deepEqual(r.pendingBadges.map((p) => p.eventId), [LAUF, FEST]);
  // Bob attended nothing.
  assert.deepEqual(ok(await mine(w.d, caller(BOB))).pendingBadges, []);
});

test("an attendee who already has an invitation is not pending; refunded tickets never are", async () => {
  const w = await world();
  w.store.seedTicket({ eventId: FEST, wallet: ALICE, status: "checked_in" });
  await invite(w.store, w.fest.typeId, ALICE);
  w.store.seedTicket({ eventId: KONZERT, wallet: ALICE, status: "refunded" });
  w.store.seedRewardEvent({ id: QR_LAUF, eventId: LAUF });
  w.store.seedRewardClaim({ wallet: ALICE, action: "event_attend", referenceId: QR_LAUF, status: "rejected" });

  const r = ok(await mine(w.d, caller(ALICE)));
  assert.deepEqual(r.pendingBadges, []);
  assert.equal(r.invitations.length, 1);
  assert.equal(r.invitations[0].type.typeId, w.fest.typeId);
});
