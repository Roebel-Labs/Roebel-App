import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId } from "@netizen-labs/credential-registry";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import { orgPublicCredentials } from "../src/lib/credentials/org-public";

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const FRAKTION = "7a2d3b8f-1e4c-4d66-8b2f-3c4d5e6f7081";
const FEST = "11111111-2222-4333-8444-555555555551";
const ANNA = "0x00000000000000000000000000000000000000b1";
const BERND = "0x00000000000000000000000000000000000000b2";
const CARLA = "0x00000000000000000000000000000000000000b3";
const DORA = "0x00000000000000000000000000000000000000b4";
const T0 = Date.parse("2026-12-20T10:00:00Z");

function typeRow(accountId: string, local: string, kind: TypeRow["kind"], name: string, extra: Partial<TypeRow> = {}): TypeRow {
  return {
    typeId: credentialTypeId(orgIdFromUuid(accountId) as Hex, keccak256(toHex(local))).toLowerCase() as Hex, registry: REGISTRY, accountId,
    orgId: orgIdFromUuid(accountId).toLowerCase() as Hex, localUuid: null, localId: keccak256(toHex(local)), kind, policy: "issuer_batch", name,
    description: null, imageUrl: null, benefits: [], template: null, defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0,
    publicClaim: true, recognised: false, retired: false, chainStatus: "onchain", eventId: null, createdBy: ANNA, createdAt: new Date(T0).toISOString(),
    ...extra,
  };
}

async function give(store: InMemoryCredentialStore, typeId: Hex, wallet: string, p: { status?: "invited" | "accepted"; claimed?: boolean } = {}) {
  const id = `44444444-4444-4444-8444-${randomBytes(6).toString("hex")}`;
  const batchId = `55555555-4444-4444-8444-${randomBytes(6).toString("hex")}`;
  await store.insertBatchWithInvitations(
    { id: batchId, actionId: null, typeId, root: keccak256(toHex(batchId)), count: 1, source: "people" },
    [{
      id, typeId, leafKind: "account", subject: wallet, validUntil: "0", salt: keccak256(toHex(id)), leafHash: keccak256(toHex(`l-${id}`)),
      proof: [], claimKeyEnc: null, tokenHash: null, tokenEnc: null, recipientWallet: wallet, displayName: null, contactEmail: null, status: "invited",
    }],
  );
  await store.updateBatch(batchId, { status: "onchain", chainBatchId: String(Math.floor(Math.random() * 1e6)) });
  await store.updateInvitation(id, { status: p.status ?? "accepted", claimedOnchain: p.claimed ?? false });
}

async function world() {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedAccount({ id: FRAKTION, accountType: "organisation", name: "Fraktion Grün", subType: "fraktion", avatarUrl: null, membersPublicColumn: null });
  store.seedUser({ wallet: ANNA, displayName: "Anna Alt", avatarUrl: "https://img.example/anna.png", username: "anna" });
  store.seedUser({ wallet: BERND, displayName: "Bernd Bau", avatarUrl: null, username: null });
  store.seedUser({ wallet: CARLA, displayName: "Carla Cord", avatarUrl: null, username: "carla" });
  store.seedUser({ wallet: DORA, displayName: "Dora Dorn", avatarUrl: null, username: null });
  store.seedEvent({ id: FEST, title: "Sommerfest", date: "2026-12-05", endDate: null, imageUrl: null, accountId: VEREIN });
  const t = {
    vorstand: typeRow(VEREIN, "vorstand", "role", "Vorstand", { recognised: true }),
    kasse: typeRow(VEREIN, "kasse", "role", "Kasse"),
    mitglied: typeRow(VEREIN, "mitglied", "membership", "Mitglied"),
    fest: typeRow(VEREIN, "fest", "badge", "Dabei: Sommerfest", { eventId: FEST, imageUrl: "https://img.example/fest.png" }),
    draft: typeRow(VEREIN, "entwurf", "membership", "Entwurf", { chainStatus: "draft" }),
    fVorsitz: typeRow(FRAKTION, "vorsitz", "role", "Vorsitz"),
    fMitglied: typeRow(FRAKTION, "mitglied", "membership", "Parteimitglied"),
  };
  for (const row of Object.values(t)) await store.upsertType(row);
  const held = new Set<string>();
  const reader = { holds: async (typeId: Hex, account: Address) => held.has(`${typeId.toLowerCase()}:${account.toLowerCase()}`) };
  const hold = (typeId: Hex, wallet: string) => held.add(`${typeId}:${wallet}`);
  return { store, t, reader, hold };
}

test("org public view: offices with holders, public members only from chain-held public claims", async () => {
  const w = await world();
  // Kasse first in insertion, Vorstand recognised: Vorstand is listed first.
  await give(w.store, w.t.kasse.typeId, BERND, { claimed: true });
  w.hold(w.t.kasse.typeId, BERND);
  await give(w.store, w.t.vorstand.typeId, ANNA, { claimed: true });
  w.hold(w.t.vorstand.typeId, ANNA);
  // Public, still held.
  await give(w.store, w.t.mitglied.typeId, CARLA, { claimed: true });
  w.hold(w.t.mitglied.typeId, CARLA);
  // Accepted privately: never listed.
  await give(w.store, w.t.mitglied.typeId, DORA);
  // Claimed publicly once, no longer held on chain: not listed.
  await give(w.store, w.t.mitglied.typeId, BERND, { claimed: true });
  // Badge: two accepted, one invited.
  await give(w.store, w.t.fest.typeId, ANNA);
  await give(w.store, w.t.fest.typeId, DORA);
  await give(w.store, w.t.fest.typeId, CARLA, { status: "invited" });

  const v = await orgPublicCredentials(w.store, w.reader, VEREIN);
  assert.ok(v);
  assert.deepEqual(v.offices.map((o) => o.name), ["Vorstand", "Kasse"]);
  assert.deepEqual(v.offices[0], { typeId: w.t.vorstand.typeId, name: "Vorstand", recognised: true, holders: [{ displayName: "Anna Alt", avatarUrl: "https://img.example/anna.png", username: "anna" }] });
  assert.deepEqual(v.offices[1].holders, [{ displayName: "Bernd Bau", avatarUrl: null, username: null }]);
  assert.deepEqual(v.publicMembers, [{ displayName: "Carla Cord", avatarUrl: null, username: "carla" }]);
  assert.deepEqual(v.badges, [{ typeId: w.t.fest.typeId, name: "Dabei: Sommerfest", imageUrl: "https://img.example/fest.png", eventTitle: "Sommerfest", collected: 2 }]);
  assert.equal(v.usesRegister, true);
});

test("a closed org without public holders returns publicMembers null; offices are still listed", async () => {
  const w = await world();
  await give(w.store, w.t.fVorsitz.typeId, ANNA, { claimed: true });
  w.hold(w.t.fVorsitz.typeId, ANNA);
  await give(w.store, w.t.fMitglied.typeId, BERND);
  const v = await orgPublicCredentials(w.store, w.reader, FRAKTION);
  assert.ok(v);
  assert.equal(v.publicMembers, null);
  assert.deepEqual(v.offices.map((o) => [o.name, o.holders.map((h) => h.displayName)]), [["Vorsitz", ["Anna Alt"]]]);
  assert.deepEqual(v.badges, []);
  assert.equal(v.usesRegister, true);

  // An org without register types: nothing in use; an unknown org: null.
  const empty = new InMemoryCredentialStore();
  empty.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  assert.deepEqual(await orgPublicCredentials(empty, w.reader, VEREIN), { offices: [], publicMembers: [], badges: [], usesRegister: false });
  assert.equal(await orgPublicCredentials(empty, w.reader, FRAKTION), null);
  assert.equal(await orgPublicCredentials(empty, w.reader, "not-a-uuid"), null);
});

test("no field of the public view looks like an address", async () => {
  const w = await world();
  await give(w.store, w.t.vorstand.typeId, ANNA, { claimed: true });
  w.hold(w.t.vorstand.typeId, ANNA);
  await give(w.store, w.t.mitglied.typeId, CARLA, { claimed: true });
  w.hold(w.t.mitglied.typeId, CARLA);
  // A holder without a user row is left out rather than shown by address.
  const NOBODY = "0x00000000000000000000000000000000000000b9";
  await give(w.store, w.t.mitglied.typeId, NOBODY, { claimed: true });
  w.hold(w.t.mitglied.typeId, NOBODY);
  const v = await orgPublicCredentials(w.store, w.reader, VEREIN);
  const json = JSON.stringify(v);
  assert.ok(!/0x[0-9a-f]{40}(?![0-9a-f])/i.test(json), json);
  assert.equal(v?.publicMembers?.length, 1);
});
