import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId, leafHash, verifyProof } from "@netizen-labs/credential-registry";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import { buildBatch, prepareBatch, prepareRevocation, MAX_BATCH_RECIPIENTS, type RecipientInput } from "../src/lib/credentials/batch";
import { openSecret, sealSecret } from "../src/lib/credentials/secrets";
import type { Deps } from "../src/lib/credentials/actions";
import type { Caller } from "../src/lib/credentials/caller";
import type { Notifier } from "../src/lib/credentials/notify";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const OWNER = "0x00000000000000000000000000000000000000a1";
const ADMIN = "0x00000000000000000000000000000000000000a2";
const MEMBER = "0x00000000000000000000000000000000000000a3";
const T0 = Date.parse("2026-11-17T10:00:00Z");
const TYPE_ID = credentialTypeId(orgIdFromUuid(VEREIN) as Hex, `0x${"11".repeat(32)}` as Hex).toLowerCase() as Hex;

const wallet = (i: number) => `0x${(0xb000 + i).toString(16).padStart(40, "0")}`;
const rand = (n: number) => new Uint8Array(randomBytes(n));
const seal = (plain: string, context: string) => sealSecret(plain, context);

function world() {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(VEREIN, OWNER, "owner");
  store.seedOwner(VEREIN, ADMIN, "admin");
  store.seedOwner(VEREIN, MEMBER, "member");
  const row: TypeRow = {
    typeId: TYPE_ID, registry: REGISTRY, accountId: VEREIN, orgId: orgIdFromUuid(VEREIN) as Hex, localUuid: null,
    localId: `0x${"11".repeat(32)}` as Hex, kind: "membership", policy: "issuer_batch", name: "Mitglied", description: null,
    imageUrl: null, benefits: [], template: "mitglied", defaultValiditySeconds: 0, claimStart: null, claimEnd: null,
    supplyCap: 0, publicClaim: true, recognised: false, retired: false, chainStatus: "onchain", eventId: null,
    createdBy: OWNER, createdAt: new Date(T0).toISOString(),
  };
  void store.upsertType(row);
  const pushes: Parameters<Notifier["push"]>[0][] = [];
  const reader = {
    isOrgRegistered: async () => true,
    canManage: async () => true,
    orgPrivateOnly: async () => false,
    leafRevoked: async () => false,
  };
  const d: Deps = {
    store,
    reader: reader as never,
    receipt: async () => null,
    head: async () => 100n,
    notify: { push: async (p) => void pushes.push(p) },
    now: () => T0,
    registry: REGISTRY,
    applyConfirmed: async () => {},
  };
  return { d, store, pushes };
}

const caller = (action: Caller["action"]): Caller => ({ ok: true, wallet: OWNER, via: "chat_session", action, payload: {} });

function must<T>(r: { ok: true; data: T } | { ok: false; status: number; code: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : `${(r as { code: string }).code}`);
  return (r as { data: T }).data;
}

test("70 account recipients build one root; every stored proof verifies against it", () => {
  const recipients: RecipientInput[] = Array.from({ length: 70 }, (_, i) => ({ kind: "account", wallet: wallet(i) }));
  const b = buildBatch({ typeId: TYPE_ID, recipients, validUntil: 0n, rand, seal });
  assert.equal(b.count, 70);
  assert.equal(b.invitations.length, 70);
  for (const inv of b.invitations) {
    assert.equal(inv.leafKind, "account");
    assert.equal(inv.recipientWallet, inv.subject);
    const h = leafHash({ kind: "account", typeId: TYPE_ID, subject: inv.subject as Address, validUntil: 0n, salt: inv.salt });
    assert.equal(h, inv.leafHash);
    assert.ok(verifyProof(b.root, inv.leafHash, inv.proof));
  }
  assert.equal(new Set(b.invitations.map((i) => i.salt)).size, 70);
});

test("a contact recipient gets a claim-key leaf, a sealed key and a token whose hash is stored", () => {
  const b = buildBatch({ typeId: TYPE_ID, recipients: [{ kind: "contact", name: "Erika Muster", email: "erika@example.org" }], validUntil: 1_900_000_000n, rand, seal });
  const inv = b.invitations[0];
  assert.equal(inv.leafKind, "claim_key");
  assert.equal(inv.recipientWallet, null);
  assert.equal(inv.displayName, "Erika Muster");
  assert.equal(inv.contactEmail, "erika@example.org");
  assert.equal(inv.validUntil, "1900000000");
  const key = openSecret(inv.claimKeyEnc!, `invitation:${inv.id}:claim_key`) as Hex;
  assert.equal(privateKeyToAccount(key).address.toLowerCase(), inv.subject);
  const token = b.plainTokens.get(inv.id)!;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(inv.tokenHash, createHash("sha256").update(token).digest("hex"));
  assert.equal(openSecret(inv.tokenEnc!, `invitation:${inv.id}:token`), token);
  assert.equal(leafHash({ kind: "claimKey", typeId: TYPE_ID, subject: inv.subject as Address, validUntil: 1_900_000_000n, salt: inv.salt }), inv.leafHash);
  assert.ok(verifyProof(b.root, inv.leafHash, inv.proof));
});

test("no plaintext claim key or token is in the invitation rows", () => {
  const keys: string[] = [];
  const b = buildBatch({
    typeId: TYPE_ID,
    recipients: [{ kind: "contact", name: "A" }, { kind: "contact", name: "B", email: "b@example.org" }],
    validUntil: 0n,
    rand,
    seal: (plain, context) => {
      keys.push(plain);
      return seal(plain, context);
    },
  });
  const json = JSON.stringify(b.invitations);
  for (const k of keys) assert.ok(!json.includes(k), "plaintext secret in rows");
  for (const t of b.plainTokens.values()) assert.ok(!json.includes(t));
  assert.equal(keys.length, 4);
});

test("the same person twice in one list is one leaf", () => {
  const b = buildBatch({
    typeId: TYPE_ID,
    recipients: [
      { kind: "account", wallet: wallet(1) },
      { kind: "account", wallet: wallet(1).toUpperCase().replace("0X", "0x") },
      { kind: "contact", name: "Erika", email: "Erika@Example.org" },
      { kind: "contact", name: "Erika M.", email: "erika@example.org" },
      { kind: "contact", name: "Hans  Meier" },
      { kind: "contact", name: "hans meier" },
    ],
    validUntil: 0n,
    rand,
    seal,
  });
  assert.equal(b.count, 3);
});

test("2001 recipients and an empty list are refused", () => {
  const many: RecipientInput[] = Array.from({ length: MAX_BATCH_RECIPIENTS + 1 }, (_, i) => ({ kind: "account", wallet: wallet(i) }));
  assert.throws(() => buildBatch({ typeId: TYPE_ID, recipients: many, validUntil: 0n, rand, seal }));
  assert.throws(() => buildBatch({ typeId: TYPE_ID, recipients: [], validUntil: 0n, rand, seal }));
});

test("prepareBatch skips people with a live invitation and includes expired or revoked ones", async () => {
  const w = world();
  const first = must(
    await prepareBatch(w.d, caller("batch_prepare"), {
      accountId: VEREIN,
      typeId: TYPE_ID,
      recipients: [
        { kind: "account", wallet: wallet(1) },
        { kind: "account", wallet: wallet(2) },
        { kind: "account", wallet: wallet(3) },
        { kind: "contact", name: "Erika", email: "erika@example.org" },
      ],
      validUntil: "2027-06-30",
    }),
  );
  assert.deepEqual(first.counts, { app: 3, link: 1, skipped: 0 });

  // The same list again while the first is still awaiting confirmation: nobody twice.
  const again = await prepareBatch(w.d, caller("batch_prepare"), {
    accountId: VEREIN,
    typeId: TYPE_ID,
    recipients: [{ kind: "account", wallet: wallet(1) }, { kind: "contact", name: "Erika", email: "erika@example.org" }],
    validUntil: "2027-06-30",
  });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.code, "NOTHING_TO_ISSUE");

  // First batch lands: 1 accepted, 2 revoked, 3 invited.
  await w.store.updateBatch(first.batchId, { status: "onchain", chainBatchId: "1" });
  await w.store.updateAction(first.actionId, { status: "done" });
  const invs = await w.store.listInvitations({ batchId: first.batchId });
  for (const i of invs) {
    const status = i.recipientWallet === wallet(1) ? "accepted" : i.recipientWallet === wallet(2) ? "revoked" : "invited";
    await w.store.updateInvitation(i.id, { status });
  }

  const second = must(
    await prepareBatch(w.d, caller("batch_prepare"), {
      accountId: VEREIN,
      typeId: TYPE_ID,
      recipients: [
        { kind: "account", wallet: wallet(1) },
        { kind: "account", wallet: wallet(2) },
        { kind: "account", wallet: wallet(3) },
        { kind: "contact", name: "Erika", email: "erika@example.org" },
      ],
      validUntil: "2027-06-30",
    }),
  );
  // 1 (accepted, same validity), 3 and Erika (invited) skipped; 2 (revoked) included.
  assert.deepEqual(second.counts, { app: 1, link: 0, skipped: 3 });

  // A longer validity is a renewal: everyone not revoked-and-already-reissued is included.
  const renewal = must(
    await prepareBatch(w.d, caller("batch_prepare"), {
      accountId: VEREIN,
      typeId: TYPE_ID,
      recipients: [{ kind: "account", wallet: wallet(1) }, { kind: "contact", name: "Erika", email: "erika@example.org" }],
      validUntil: "2028-06-30",
    }),
  );
  assert.deepEqual(renewal.counts, { app: 1, link: 1, skipped: 0 });

  const inv = (await w.store.listInvitations({ batchId: renewal.batchId }))[0];
  // End of 2028-06-30 in Europe/Berlin (CEST, UTC+2).
  assert.equal(inv.validUntil, String(Date.parse("2028-06-30T21:59:59Z") / 1000));
});

test("fromMemberList uses every account_owners row of the org", async () => {
  const w = world();
  const r = must(await prepareBatch(w.d, caller("batch_prepare"), { accountId: VEREIN, typeId: TYPE_ID, fromMemberList: true }));
  assert.deepEqual(r.counts, { app: 3, link: 0, skipped: 0 });
  const invs = await w.store.listInvitations({ batchId: r.batchId });
  assert.deepEqual(invs.map((i) => i.recipientWallet).sort(), [OWNER, ADMIN, MEMBER].sort());
  const batch = await w.store.getBatch(r.batchId);
  assert.equal(batch?.source, "member_list");
  assert.equal(batch?.actionId, r.actionId);
  assert.equal(batch?.status, "prepared");
});

test("steps and summary contain no name, email or address", async () => {
  const w = world();
  const recipients: RecipientInput[] = [
    { kind: "account", wallet: wallet(7), displayName: "Karl Kontomann" },
    { kind: "contact", name: "Erika Muster", email: "erika.muster@example.org" },
  ];
  const r = must(await prepareBatch(w.d, caller("batch_prepare"), { accountId: VEREIN, typeId: TYPE_ID, recipients }));
  const action = await w.store.getAction(r.actionId);
  assert.ok(action);
  const json = JSON.stringify({ steps: action.steps, summary: action.summary }).toLowerCase();
  for (const v of [wallet(7), "karl kontomann", "erika muster", "erika.muster@example.org"]) assert.ok(!json.includes(v.toLowerCase()), v);
  const invs = await w.store.listInvitations({ batchId: r.batchId });
  for (const i of invs) assert.ok(!json.includes(i.subject.slice(2)));
  assert.equal((action.summary as { title: string }).title, "2 Ausweise ausstellen: Mitglied");
  assert.equal(action.steps.length, 1);
  assert.equal(action.steps[0].fn, "addBatch");
  assert.ok(!JSON.stringify(w.pushes).toLowerCase().includes("erika"));
});

async function onchainBatchOf(w: ReturnType<typeof world>, n: number) {
  const recipients: RecipientInput[] = Array.from({ length: n }, (_, i) => ({ kind: "account", wallet: wallet(1000 + i) }));
  const r = must(await prepareBatch(w.d, caller("batch_prepare"), { accountId: VEREIN, typeId: TYPE_ID, recipients }));
  return r;
}

test("prepareRevocation of 450 invitations yields three revokeLeaves steps", async () => {
  const w = world();
  const r = await onchainBatchOf(w, 450);
  await w.store.updateBatch(r.batchId, { status: "onchain", chainBatchId: "7" });
  const invs = await w.store.listInvitations({ batchId: r.batchId });
  const rev = must(await prepareRevocation(w.d, caller("revoke_prepare"), { accountId: VEREIN, invitationIds: invs.map((i) => i.id) }));
  const action = await w.store.getAction(rev.actionId);
  assert.ok(action);
  assert.equal(action.steps.length, 3);
  const leaves = action.steps.flatMap((s) => (s.fn === "revokeLeaves" ? (assert.equal(s.batchId, "7"), s.leaves) : []));
  assert.equal(leaves.length, 450);
  assert.deepEqual(new Set(leaves), new Set(invs.map((i) => i.leafHash)));

  const whole = must(await prepareRevocation(w.d, caller("revoke_prepare"), { accountId: VEREIN, batchId: r.batchId }));
  const a2 = await w.store.getAction(whole.actionId);
  assert.deepEqual(a2?.steps, [{ fn: "revokeBatch", batchId: "7" }]);
});

test("prepareRevocation refuses a batch that is not on chain", async () => {
  const w = world();
  const r = await onchainBatchOf(w, 2);
  const invs = await w.store.listInvitations({ batchId: r.batchId });
  const a = await prepareRevocation(w.d, caller("revoke_prepare"), { accountId: VEREIN, invitationIds: invs.map((i) => i.id) });
  assert.equal(a.ok, false);
  if (!a.ok) assert.equal(a.code, "BATCH_NOT_ON_CHAIN");
  const b = await prepareRevocation(w.d, caller("revoke_prepare"), { accountId: VEREIN, batchId: r.batchId });
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.code, "BATCH_NOT_ON_CHAIN");
});
