import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId } from "@netizen-labs/credential-registry";
import type { Address, Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import { prepareBatch } from "../src/lib/credentials/batch";
import { listPeople, normaliseRecipients, parsePeopleCsv, searchPeople } from "../src/lib/credentials/people";
import type { Deps } from "../src/lib/credentials/actions";
import type { Caller } from "../src/lib/credentials/caller";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const FRAKTION = "7a2d3b8f-1e4c-4d66-8b2f-3c4d5e6f7081";
const OWNER = "0x00000000000000000000000000000000000000a1";
const MEMBER = "0x00000000000000000000000000000000000000a3";
const T0 = Date.parse("2026-11-17T10:00:00Z");
const TYPE_ID = credentialTypeId(orgIdFromUuid(FRAKTION) as Hex, `0x${"22".repeat(32)}` as Hex).toLowerCase() as Hex;
const wallet = (i: number) => `0x${(0xc000 + i).toString(16).padStart(40, "0")}`;

function world() {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: FRAKTION, accountType: "organisation", name: "Fraktion Grün", subType: "fraktion", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(FRAKTION, OWNER, "owner");
  store.seedOwner(FRAKTION, MEMBER, "member");
  store.seedUser({ wallet: wallet(1), displayName: "Anna Aktiv", avatarUrl: "https://x/a.png" });
  store.seedUser({ wallet: wallet(2), displayName: "Bernd Anders", avatarUrl: null });
  store.seedUser({ wallet: wallet(3), displayName: "Clara", avatarUrl: null, username: "clara_k" });
  for (let i = 0; i < 30; i++) store.seedUser({ wallet: wallet(100 + i), displayName: `Annette ${i}`, avatarUrl: null });
  const row: TypeRow = {
    typeId: TYPE_ID, registry: REGISTRY, accountId: FRAKTION, orgId: orgIdFromUuid(FRAKTION) as Hex, localUuid: null,
    localId: `0x${"22".repeat(32)}` as Hex, kind: "membership", policy: "issuer_batch", name: "Mitglied", description: null,
    imageUrl: null, benefits: [], template: "mitglied", defaultValiditySeconds: 0, claimStart: null, claimEnd: null,
    supplyCap: 0, publicClaim: true, recognised: false, retired: false, chainStatus: "onchain", eventId: null,
    createdBy: OWNER, createdAt: new Date(T0).toISOString(),
  };
  void store.upsertType(row);
  const d: Deps = {
    store,
    reader: { isOrgRegistered: async () => true, canManage: async () => true, orgPrivateOnly: async () => true, leafRevoked: async () => false } as never,
    receipt: async () => null,
    head: async () => 1n,
    notify: { push: async () => {} },
    now: () => T0,
    registry: REGISTRY,
    applyConfirmed: async () => {},
  };
  return { d, store };
}

const caller = (action: Caller["action"], w = OWNER): Caller => ({ ok: true, wallet: w, via: "chat_session", action, payload: {} });

test("listPeople reports public only after the chain claim and nothing more about private holders", async () => {
  const w = world();
  const prep = await prepareBatch(w.d, caller("batch_prepare"), {
    accountId: FRAKTION,
    typeId: TYPE_ID,
    recipients: [
      { kind: "account", wallet: wallet(1), displayName: "Anna Aktiv" },
      { kind: "account", wallet: wallet(2), displayName: "Bernd Anders" },
      { kind: "account", wallet: wallet(3) },
      { kind: "contact", name: "Dora Draußen", email: "dora@example.org" },
    ],
    validUntil: "2027-12-31",
  });
  assert.ok(prep.ok);
  if (!prep.ok) return;

  // Not yet confirmed: nobody is listed as invited.
  const before = await listPeople(w.d, caller("people_list"), { accountId: FRAKTION, typeId: TYPE_ID });
  assert.ok(before.ok && before.data.length === 0);

  await w.store.updateBatch(prep.data.batchId, { status: "onchain", chainBatchId: "3" });
  const invs = await w.store.listInvitations({ batchId: prep.data.batchId });
  const by = (wal: string | null, name?: string) => invs.find((i) => (wal ? i.recipientWallet === wal : i.displayName === name))!;
  await w.store.updateInvitations({ batchId: prep.data.batchId }, { status: "invited", invitedAt: new Date(T0).toISOString() });
  await w.store.updateInvitation(by(wallet(1)).id, { status: "accepted", claimedOnchain: true });
  await w.store.updateInvitation(by(wallet(2)).id, { status: "accepted", claimedOnchain: false });
  await w.store.updateInvitation(by(wallet(3)).id, { status: "declined" });

  const r = await listPeople(w.d, caller("people_list"), { accountId: FRAKTION, typeId: TYPE_ID });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.length, 4);
  for (const p of r.data) {
    assert.deepEqual(Object.keys(p).sort(), ["displayName", "hasLink", "id", "public", "state", "validUntil"]);
  }
  const anna = r.data.find((p) => p.displayName === "Anna Aktiv")!;
  const bernd = r.data.find((p) => p.displayName === "Bernd Anders")!;
  const clara = r.data.find((p) => p.displayName === "Clara")!;
  const dora = r.data.find((p) => p.displayName === "Dora Draußen")!;
  assert.deepEqual([anna.state, anna.public], ["angenommen", true]);
  assert.deepEqual([bernd.state, bernd.public], ["angenommen", false]);
  assert.deepEqual([clara.state, clara.public], ["abgelehnt", false]);
  assert.deepEqual([dora.state, dora.public, dora.hasLink], ["eingeladen", false, true]);
  assert.equal(anna.hasLink, false);
  assert.equal(anna.validUntil, new Date(Date.parse("2027-12-31T22:59:59Z")).toISOString());
  const json = JSON.stringify(r.data);
  for (const s of [wallet(1), wallet(2), "dora@example.org"]) assert.ok(!json.includes(s), s);

  const member = await listPeople(w.d, caller("people_list", MEMBER), { accountId: FRAKTION, typeId: TYPE_ID });
  assert.equal(member.ok, false);
});

test("searchPeople finds app users by display name, at most 20, and needs an org role", async () => {
  const w = world();
  const r = await searchPeople(w.d, caller("people_search"), { accountId: FRAKTION, query: "ann" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.length, 20);
  assert.ok(r.data.every((u) => /ann/i.test(u.displayName)));
  assert.deepEqual(Object.keys(r.data[0]).sort(), ["avatarUrl", "displayName", "wallet"]);
  const byUsername = await searchPeople(w.d, caller("people_search"), { accountId: FRAKTION, query: "clara_" });
  assert.ok(byUsername.ok && byUsername.data.length === 1 && byUsername.data[0].displayName === "Clara");
  assert.ok(byUsername.ok && !("username" in byUsername.data[0]));
  const short = await searchPeople(w.d, caller("people_search"), { accountId: FRAKTION, query: "a" });
  assert.ok(short.ok && short.data.length === 0);
  const member = await searchPeople(w.d, caller("people_search", MEMBER), { accountId: FRAKTION, query: "ann" });
  assert.equal(member.ok, false);
});

test("parsePeopleCsv reads 'Name;E-Mail' with and without a header and reports rows without a name", () => {
  const withHeader = parsePeopleCsv("Name;E-Mail\nErika Muster;erika@example.org\n\"Meier, Hans\";hans@example.org\n;nobody@example.org\n");
  const noHeader = parsePeopleCsv("erika@example.org,Erika Muster\r\nHans Meier,\r\n");
  const n1 = normaliseRecipients(withHeader);
  assert.deepEqual(n1.recipients, [
    { kind: "contact", name: "Erika Muster", email: "erika@example.org" },
    { kind: "contact", name: "Meier, Hans", email: "hans@example.org" },
  ]);
  assert.equal(n1.rejected.length, 1);
  assert.equal(n1.rejected[0].row, 4);
  assert.match(n1.rejected[0].reason, /Name/);

  const n2 = normaliseRecipients(noHeader);
  assert.deepEqual(n2.recipients, [
    { kind: "contact", name: "Erika Muster", email: "erika@example.org" },
    { kind: "contact", name: "Hans Meier" },
  ]);
  assert.deepEqual(n2.rejected, []);

  const three = normaliseRecipients(parsePeopleCsv("Vorname;Nachname;E-Mail\nErika;Muster;erika@example.org\n"));
  assert.deepEqual(three.recipients, [{ kind: "contact", name: "Erika Muster", email: "erika@example.org" }]);

  const n3 = normaliseRecipients([{ kind: "account", wallet: "nope" }, { kind: "contact", name: "X", email: "bad" }, 7]);
  assert.equal(n3.recipients.length, 0);
  assert.deepEqual(n3.rejected.map((r) => r.row), [1, 2, 3]);
});
