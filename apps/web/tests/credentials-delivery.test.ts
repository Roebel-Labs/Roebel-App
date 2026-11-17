import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId } from "@netizen-labs/credential-registry";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { InMemoryCredentialStore, type InvitationRow, type NewInvitation, type TypeRow } from "../src/lib/credentials/store";
import { deliverInvitations, invitePush, inviteMail, inviteUrl, prepareLetters, type DeliveryDeps } from "../src/lib/credentials/delivery";
import { sealSecret } from "../src/lib/credentials/secrets";
import type { Notifier } from "../src/lib/credentials/notify";
import type { Caller } from "../src/lib/credentials/caller";
import type { OutgoingMail } from "../src/lib/passkey/email-mailer";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");
delete process.env.NEXT_PUBLIC_SITE_URL;

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const FRAKTION = "7a2d3b8f-1e4c-4d66-8b2f-3c4d5e6f7081";
const OWNER = "0x00000000000000000000000000000000000000a1";
const MEMBER = "0x00000000000000000000000000000000000000a3";
const ALICE = "0x00000000000000000000000000000000000000b1";
const BOB = "0x00000000000000000000000000000000000000b2";
const T0 = Date.parse("2026-11-17T10:00:00Z");

const typeIdOf = (account: string, local: string) => credentialTypeId(orgIdFromUuid(account) as Hex, keccak256(toHex(local))).toLowerCase() as Hex;

function typeRow(typeId: Hex, accountId: string, kind: TypeRow["kind"], name: string): TypeRow {
  return {
    typeId, registry: REGISTRY, accountId, orgId: orgIdFromUuid(accountId) as Hex, localUuid: null, localId: keccak256(toHex(name)),
    kind, policy: "issuer_batch", name, description: null, imageUrl: null, benefits: [], template: null,
    defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0, publicClaim: true, recognised: false, retired: false,
    chainStatus: "onchain", eventId: null, createdBy: OWNER, createdAt: new Date(T0).toISOString(),
  };
}

let n = 0;
const uuid = () => `33333333-3333-4333-8333-${(++n).toString(16).padStart(12, "0")}`;

type Person = { wallet?: string; name?: string; email?: string; token?: string };

function invitation(typeId: Hex, p: Person): { row: NewInvitation; token: string | null } {
  const id = uuid();
  if (p.wallet) {
    return {
      token: null,
      row: {
        id, typeId, leafKind: "account", subject: p.wallet, validUntil: "0", salt: keccak256(toHex(id)), leafHash: keccak256(toHex(`leaf-${id}`)),
        proof: [], claimKeyEnc: null, tokenHash: null, tokenEnc: null, recipientWallet: p.wallet, displayName: p.name ?? null, contactEmail: null,
      },
    };
  }
  const token = p.token ?? randomBytes(32).toString("base64url");
  return {
    token,
    row: {
      id, typeId, leafKind: "claim_key", subject: `0x${"d1".repeat(20)}`, validUntil: "0", salt: keccak256(toHex(id)), leafHash: keccak256(toHex(`leaf-${id}`)),
      proof: [], claimKeyEnc: sealSecret(`0x${"11".repeat(32)}`, `invitation:${id}:claim_key`),
      tokenHash: createHash("sha256").update(token).digest("hex"), tokenEnc: sealSecret(token, `invitation:${id}:token`),
      recipientWallet: null, displayName: p.name ?? null, contactEmail: p.email ?? null,
    },
  };
}

async function world() {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedAccount({ id: FRAKTION, accountType: "organisation", name: "Fraktion Grün", subType: "fraktion", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(VEREIN, OWNER, "owner");
  store.seedOwner(VEREIN, MEMBER, "member");
  const types = {
    verein: typeRow(typeIdOf(VEREIN, "mitglied"), VEREIN, "membership", "Mitglied"),
    badge: typeRow(typeIdOf(VEREIN, "helfer"), VEREIN, "badge", "Helfer 2026"),
    fraktion: typeRow(typeIdOf(FRAKTION, "mitglied"), FRAKTION, "membership", "Parteimitglied"),
  };
  for (const t of Object.values(types)) await store.upsertType(t);
  const pushes: Parameters<Notifier["push"]>[0][] = [];
  const mails: OutgoingMail[] = [];
  let failPushFor: string | null = null;
  let failMail = false;
  const d: DeliveryDeps = {
    store,
    notify: {
      push: async (p) => {
        if (failPushFor && p.wallets.includes(failPushFor)) throw new Error("push hub down");
        pushes.push(p);
      },
    },
    mailer: {
      send: async (m) => {
        if (failMail) throw new Error("mail down");
        mails.push(m);
      },
    },
    now: () => T0,
  };
  async function batch(typeId: Hex, people: Person[], status: "onchain" | "prepared" = "onchain") {
    const id = uuid();
    const made = people.map((p) => invitation(typeId, p));
    await store.insertBatchWithInvitations({ id, actionId: null, typeId, root: keccak256(toHex(`root-${id}`)), count: made.length, source: "people" }, made.map((m) => m.row));
    await store.updateBatch(id, { status, chainBatchId: status === "onchain" ? String(n) : null });
    return { id, invitations: made.map((m) => ({ id: m.row.id, token: m.token })) };
  }
  return {
    d, store, types, pushes, mails, batch,
    failPush: (w: string | null) => (failPushFor = w),
    failMail: (v: boolean) => (failMail = v),
  };
}

const inv = async (store: InMemoryCredentialStore, id: string) => (await store.getInvitation(id)) as InvitationRow;

test("account leaves are pushed, mail leaves are mailed once and the address is erased", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{ wallet: ALICE }, { name: "Erika Muster", email: "erika@example.org" }, { name: "Otto Ohnemail" }]);
  const r = await deliverInvitations(w.d, b.id);
  assert.deepEqual(r, { pushed: 1, mailed: 1, linkOnly: 1 });

  assert.equal(w.pushes.length, 1);
  assert.deepEqual(w.pushes[0].wallets, [ALICE]);
  assert.equal(w.pushes[0].type, "credential_invite");
  assert.deepEqual(w.pushes[0].data, { type: "credential_invite", invitationId: b.invitations[0].id });

  assert.equal(w.mails.length, 1);
  assert.equal(w.mails[0].to, "erika@example.org");
  assert.equal(w.mails[0].subject, "Dein Ausweis: Mitglied");
  assert.ok(w.mails[0].text.includes(`https://www.roebel.app/invite/ausweis/${b.invitations[1].token}`));
  assert.ok(w.mails[0].text.includes("persönlich"));

  const mailed = await inv(w.store, b.invitations[1].id);
  assert.equal(mailed.contactEmail, null);
  assert.equal(mailed.emailSentAt, new Date(T0).toISOString());
  for (const i of b.invitations) {
    const row = await inv(w.store, i.id);
    assert.equal(row.status, "invited");
    assert.equal(row.invitedAt, new Date(T0).toISOString());
  }
});

test("a second deliverInvitations call for the same batch sends nothing", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{ wallet: ALICE }, { name: "Erika Muster", email: "erika@example.org" }]);
  await deliverInvitations(w.d, b.id);
  const r = await deliverInvitations(w.d, b.id);
  assert.deepEqual(r, { pushed: 0, mailed: 0, linkOnly: 0 });
  assert.equal(w.pushes.length, 1);
  assert.equal(w.mails.length, 1);

  // Two concurrent calls (the sync and a recovery sweep) still send each invitation once.
  const w2 = await world();
  const b2 = await w2.batch(w2.types.verein.typeId, [{ wallet: ALICE }, { wallet: BOB }, { name: "Erika Muster", email: "erika@example.org" }]);
  await Promise.all([deliverInvitations(w2.d, b2.id), deliverInvitations(w2.d, b2.id)]);
  assert.equal(w2.pushes.length, 2);
  assert.equal(w2.mails.length, 1);

  // A batch not on chain is never delivered.
  const w3 = await world();
  const b3 = await w3.batch(w3.types.verein.typeId, [{ wallet: ALICE }], "prepared");
  assert.deepEqual(await deliverInvitations(w3.d, b3.id), { pushed: 0, mailed: 0, linkOnly: 0 });
  assert.equal((await inv(w3.store, b3.invitations[0].id)).status, "prepared");
});

test("push text for a closed org (membersMayBePublic false) names neither org nor type", async () => {
  const w = await world();
  const p = invitePush(w.types.fraktion, "Fraktion Grün", false);
  assert.equal(p.title, "Neuer Ausweis");
  assert.equal(p.body, "Du hast einen Ausweis erhalten. Öffne die App, um ihn anzusehen.");

  // End to end: the push and the mail of a fraktion batch carry neither name.
  const b = await w.batch(w.types.fraktion.typeId, [{ wallet: ALICE }, { name: "Erika Muster", email: "erika@example.org" }]);
  await deliverInvitations(w.d, b.id);
  const texts = [w.pushes[0].title, w.pushes[0].body, JSON.stringify(w.pushes[0].data), w.mails[0].subject, w.mails[0].text];
  for (const t of texts) {
    assert.ok(!t.includes("Fraktion"), t);
    assert.ok(!t.includes("Parteimitglied"), t);
  }
});

test("push text for a verein is 'Neuer Ausweis' / '<Org>: <Typ>'; a badge says 'Neues Abzeichen'", async () => {
  const w = await world();
  assert.deepEqual(invitePush(w.types.verein, "Heimatverein", true), { title: "Neuer Ausweis", body: "Heimatverein: Mitglied" });
  assert.deepEqual(invitePush(w.types.badge, "Heimatverein", true), { title: "Neues Abzeichen", body: "Heimatverein: Helfer 2026" });
  assert.deepEqual(invitePush(w.types.verein, null, true), { title: "Neuer Ausweis", body: "Mitglied" });
  const m = inviteMail({ to: "a@example.org", type: w.types.verein, orgName: "Heimatverein", membersMayBePublic: true, url: "https://www.roebel.app/invite/ausweis/x" });
  assert.equal(m.subject, "Dein Ausweis: Mitglied");
});

test("a failing push does not stop the others and still marks the invitation invited", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{ wallet: ALICE }, { wallet: BOB }]);
  w.failPush(ALICE);
  const r = await deliverInvitations(w.d, b.id);
  assert.equal(r.pushed, 1);
  assert.deepEqual(w.pushes.map((p) => p.wallets[0]), [BOB]);
  for (const i of b.invitations) assert.equal((await inv(w.store, i.id)).status, "invited");
});

test("a failing mail keeps the invitation prepared with its address, and a later call sends it once", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{ name: "Erika Muster", email: "erika@example.org" }]);
  w.failMail(true);
  assert.deepEqual(await deliverInvitations(w.d, b.id), { pushed: 0, mailed: 0, linkOnly: 0 });
  let row = await inv(w.store, b.invitations[0].id);
  assert.equal(row.status, "prepared");
  assert.equal(row.contactEmail, "erika@example.org");
  w.failMail(false);
  assert.deepEqual(await deliverInvitations(w.d, b.id), { pushed: 0, mailed: 1, linkOnly: 0 });
  row = await inv(w.store, b.invitations[0].id);
  assert.equal(row.status, "invited");
  assert.equal(row.contactEmail, null);
  assert.equal(w.mails.length, 1);
});

test("letters include only open claim-key invitations and one page each", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [
    { wallet: ALICE },
    { name: "Erika Muster" },
    { name: "=HYPERLINK(1)", email: "x@example.org" },
    { name: "Angenommen" },
    { name: "Widerrufen" },
  ]);
  await deliverInvitations(w.d, b.id);
  await w.store.updateInvitation(b.invitations[3].id, { status: "accepted", recipientWallet: BOB });
  await w.store.updateInvitation(b.invitations[4].id, { status: "revoked" });

  const calls: { rows: { displayName: string; url: string }[]; ctx: { orgName: string; typeName: string } }[] = [];
  const render = async (rows: { displayName: string; url: string }[], ctx: { orgName: string; typeName: string }) => {
    calls.push({ rows, ctx });
    return Buffer.from("%PDF-test");
  };
  const caller = (wallet: string): Caller => ({ ok: true, wallet, via: "signature", action: "letters", payload: {} });

  const r = await prepareLetters(w.d, caller(OWNER), { accountId: VEREIN, batchId: b.id }, render);
  assert.ok(r.ok);
  assert.equal(r.data.toString(), "%PDF-test");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].ctx, { orgName: "Heimatverein", typeName: "Mitglied" });
  assert.deepEqual(calls[0].rows, [
    { displayName: "Erika Muster", url: `https://www.roebel.app/invite/ausweis/${b.invitations[1].token}` },
    { displayName: "=HYPERLINK(1)", url: `https://www.roebel.app/invite/ausweis/${b.invitations[2].token}` },
  ]);

  const member = await prepareLetters(w.d, caller(MEMBER), { accountId: VEREIN, batchId: b.id }, render);
  assert.ok(!member.ok && member.status === 403);
  const other = await w.batch(w.types.fraktion.typeId, [{ name: "Fremd" }]);
  const foreign = await prepareLetters(w.d, caller(OWNER), { accountId: VEREIN, batchId: other.id }, render);
  assert.ok(!foreign.ok && foreign.status === 404);
  assert.equal(calls.length, 1);
});

test("renderLetters makes one A4 page per person", async () => {
  const { renderLetters } = await import("../src/lib/credentials/letters");
  const pdf = await renderLetters(
    [
      { displayName: "Erika Muster", url: "https://www.roebel.app/invite/ausweis/abc" },
      { displayName: "=SUMME(1)", url: "https://www.roebel.app/invite/ausweis/def" },
    ],
    { orgName: "Heimatverein", typeName: "Mitglied" },
  );
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [];
  assert.equal(pages.length, 2);
});

test("inviteUrl uses the www host", () => {
  assert.equal(inviteUrl("abc_-1"), "https://www.roebel.app/invite/ausweis/abc_-1");
  assert.equal(inviteUrl("abc", { NEXT_PUBLIC_SITE_URL: "https://roebel.app/" }), "https://www.roebel.app/invite/ausweis/abc");
  assert.equal(inviteUrl("abc", { NEXT_PUBLIC_SITE_URL: "https://staging.example.org" }), "https://staging.example.org/invite/ausweis/abc");
});
