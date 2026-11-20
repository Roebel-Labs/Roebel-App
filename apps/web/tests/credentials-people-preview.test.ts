import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId } from "@netizen-labs/credential-registry";
import type { Address, Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import { prepareBatch, previewPeople } from "../src/lib/credentials/batch";
import { authenticateCaller, ORG_ACTIONS, type Caller } from "../src/lib/credentials/caller";
import type { Deps } from "../src/lib/credentials/actions";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const OWNER = "0x00000000000000000000000000000000000000a1";
const T0 = Date.parse("2026-11-17T10:00:00Z");
const TYPE_ID = credentialTypeId(orgIdFromUuid(VEREIN) as Hex, `0x${"11".repeat(32)}` as Hex).toLowerCase() as Hex;
const wallet = (i: number) => `0x${(0xb000 + i).toString(16).padStart(40, "0")}`;

function world() {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(VEREIN, OWNER, "owner");
  store.seedUser({ wallet: wallet(1), displayName: "Anna App", avatarUrl: null });
  const row: TypeRow = {
    typeId: TYPE_ID, registry: REGISTRY, accountId: VEREIN, orgId: orgIdFromUuid(VEREIN) as Hex, localUuid: null,
    localId: `0x${"11".repeat(32)}` as Hex, kind: "membership", policy: "issuer_batch", name: "Mitglied", description: null,
    imageUrl: null, benefits: [], template: "mitglied", defaultValiditySeconds: 0, claimStart: null, claimEnd: null,
    supplyCap: 0, publicClaim: true, recognised: false, retired: false, chainStatus: "onchain", eventId: null,
    createdBy: OWNER, createdAt: new Date(T0).toISOString(),
  };
  void store.upsertType(row);
  const d: Deps = {
    store,
    reader: { isOrgRegistered: async () => true, canManage: async () => true, orgPrivateOnly: async () => false, leafRevoked: async () => false } as never,
    receipt: async () => null,
    head: async () => 100n,
    notify: { push: async () => {} },
    now: () => T0,
    registry: REGISTRY,
    applyConfirmed: async () => {},
  };
  return { d, store };
}

const caller = (action: Caller["action"]): Caller => ({ ok: true, wallet: OWNER, via: "chat_session", action, payload: {} });

function snapshot(store: InMemoryCredentialStore) {
  return { batches: store.batches.size, invitations: store.invitations.size, actions: store.actions.size, types: store.types.size };
}

/** Deterministic randomness: the same seed yields the same bytes in the same order. */
function seeded(seed: string) {
  let n = 0;
  return (bytes: number) => {
    const out = new Uint8Array(bytes);
    let off = 0;
    while (off < bytes) {
      const h = createHash("sha256").update(`${seed}:${n++}`).digest();
      out.set(h.subarray(0, Math.min(32, bytes - off)), off);
      off += 32;
    }
    return out;
  };
}

test("people_preview counts app, link and skipped exactly as batch_prepare would and writes nothing", async () => {
  const w = world();
  // wallet(9) already holds a live invitation on chain.
  const seed = await prepareBatch(w.d, caller("batch_prepare"), { accountId: VEREIN, typeId: TYPE_ID, recipients: [{ kind: "account", wallet: wallet(9) }] });
  assert.equal(seed.ok, true);
  if (!seed.ok) return;
  await w.store.updateBatch(seed.data.batchId, { status: "onchain", chainBatchId: "1" });
  await w.store.updateAction(seed.data.actionId, { status: "done" });
  for (const i of await w.store.listInvitations({ batchId: seed.data.batchId })) await w.store.updateInvitation(i.id, { status: "invited" });

  const input = {
    accountId: VEREIN,
    typeId: TYPE_ID,
    recipients: [
      { kind: "account" as const, wallet: wallet(1) },
      { kind: "account" as const, wallet: wallet(2), displayName: "Bernd" },
      { kind: "account" as const, wallet: wallet(9) },
      { kind: "contact" as const, name: "Erika Muster", email: "erika@example.org" },
      { kind: "contact" as const, name: "Hans Ohne" },
    ],
  };
  const before = snapshot(w.store);
  const pv = await previewPeople(w.d, caller("people_preview"), input);
  assert.equal(pv.ok, true);
  if (!pv.ok) return;
  assert.deepEqual(snapshot(w.store), before, "preview wrote something");
  assert.deepEqual({ app: pv.data.app, link: pv.data.link, skipped: pv.data.skipped }, { app: 2, link: 2, skipped: 1 });
  assert.deepEqual(pv.data.rejected, []);
  assert.deepEqual(pv.data.rows, [
    { displayName: "Anna App", channel: "app" },
    { displayName: "Bernd", channel: "app" },
    { displayName: "Erika Muster", channel: "mail" },
    { displayName: "Hans Ohne", channel: "link" },
  ]);
  // No email address in the preview.
  assert.ok(!JSON.stringify(pv.data).includes("@"));

  const real = await prepareBatch(w.d, caller("batch_prepare"), input);
  assert.equal(real.ok, true);
  if (real.ok) assert.deepEqual(real.data.counts, { app: pv.data.app, link: pv.data.link, skipped: pv.data.skipped });
});

test("a 70-row csv with 5 rows without a name previews 65 people and lists rows 3, 9, 20, 41, 66", async () => {
  const w = world();
  const broken = new Set([3, 9, 20, 41, 66]);
  const lines = Array.from({ length: 70 }, (_, i) => {
    const row = i + 1;
    return broken.has(row) ? `;person${row}@example.org` : `Person ${row};person${row}@example.org`;
  });
  const before = snapshot(w.store);
  const pv = await previewPeople(w.d, caller("people_preview"), { accountId: VEREIN, typeId: TYPE_ID, csv: lines.join("\n") });
  assert.equal(pv.ok, true);
  if (!pv.ok) return;
  assert.equal(pv.data.rows.length, 65);
  assert.equal(pv.data.app + pv.data.link, 65);
  assert.deepEqual(pv.data.rejected.map((r) => r.row), [3, 9, 20, 41, 66]);
  assert.ok(pv.data.rejected.every((r) => r.reason === "Name fehlt"));
  assert.deepEqual(snapshot(w.store), before);

  // Nothing is prepared from the raw list until the admin confirms the preview ...
  const refused = await prepareBatch(w.d, caller("batch_prepare"), { accountId: VEREIN, typeId: TYPE_ID, csv: lines.join("\n") });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.code, "REJECTED_ROWS");
  // ... and the confirmed preview issues exactly the 65.
  const ok = await prepareBatch(w.d, caller("batch_prepare"), { accountId: VEREIN, typeId: TYPE_ID, csv: lines.join("\n"), dropRejected: true });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.data.counts, { app: 0, link: 65, skipped: 0 });
});

test("batch_prepare with csv builds the same root as with the equivalent recipients array", async () => {
  const csv = "Name;E-Mail\nErika Muster;erika@example.org\nHans Meier\n\"Müller, Jo\";jo@example.org\n";
  const a = world();
  const viaCsv = await prepareBatch(a.d, caller("batch_prepare"), { accountId: VEREIN, typeId: TYPE_ID, csv }, { rand: seeded("s1") });
  const b = world();
  const viaArray = await prepareBatch(
    b.d,
    caller("batch_prepare"),
    {
      accountId: VEREIN,
      typeId: TYPE_ID,
      recipients: [
        { kind: "contact", name: "Erika Muster", email: "erika@example.org" },
        { kind: "contact", name: "Hans Meier" },
        { kind: "contact", name: "Müller, Jo", email: "jo@example.org" },
      ],
    },
    { rand: seeded("s1") },
  );
  assert.equal(viaCsv.ok, true);
  assert.equal(viaArray.ok, true);
  if (!viaCsv.ok || !viaArray.ok) return;
  const rootA = (await a.store.getBatch(viaCsv.data.batchId))!.root;
  const rootB = (await b.store.getBatch(viaArray.data.batchId))!.root;
  assert.equal(rootA, rootB);
  assert.equal(viaCsv.data.counts.link, 3);
});

test("people_preview is allowed with a chat session (Studio)", async () => {
  const w = world();
  assert.ok(ORG_ACTIONS.includes("people_preview"));
  const c = await authenticateCaller(
    { headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? "Bearer chat.jwt.token" : null) } },
    { action: "people_preview", payload: { accountId: VEREIN, typeId: TYPE_ID, csv: "Erika;erika@example.org" } },
    ORG_ACTIONS,
    { verifyChatToken: async (t) => (t === "chat.jwt.token" ? OWNER : null) },
  );
  assert.equal(c.ok, true);
  if (!c.ok) return;
  assert.equal(c.via, "chat_session");
  const pv = await previewPeople(w.d, c, c.payload as never);
  assert.equal(pv.ok, true);
  if (pv.ok) assert.equal(pv.data.link, 1);
});

test("a member (not owner or admin) cannot preview", async () => {
  const w = world();
  w.store.seedOwner(VEREIN, wallet(50), "member");
  const pv = await previewPeople(w.d, { ...caller("people_preview"), wallet: wallet(50) }, { accountId: VEREIN, typeId: TYPE_ID, recipients: [{ kind: "contact", name: "X" }] });
  assert.equal(pv.ok, false);
  if (!pv.ok) assert.equal(pv.status, 403);
});

test("the people table can revoke a selection spanning two batches of one type in one action", async () => {
  const { prepareRevocation } = await import("../src/lib/credentials/batch");
  const w = world();
  const ids: string[] = [];
  for (const [n, chainId] of [[1, "7"], [2, "8"]] as const) {
    const r = await prepareBatch(w.d, caller("batch_prepare"), { accountId: VEREIN, typeId: TYPE_ID, recipients: [{ kind: "account", wallet: wallet(n) }, { kind: "account", wallet: wallet(n + 10) }] });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    await w.store.updateBatch(r.data.batchId, { status: "onchain", chainBatchId: chainId });
    const invs = await w.store.listInvitations({ batchId: r.data.batchId });
    for (const i of invs) await w.store.updateInvitation(i.id, { status: "invited" });
    ids.push(invs[0].id);
  }
  const r = await prepareRevocation(w.d, caller("revoke_prepare"), { accountId: VEREIN, invitationIds: ids });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const a = await w.store.getAction(r.data.actionId);
  assert.deepEqual(a!.steps.map((s) => (s.fn === "revokeLeaves" ? `${s.batchId}:${s.leaves.length}` : s.fn)), ["7:1", "8:1"]);
  assert.match(String(a!.summary.title), /^2 Ausweise widerrufen: Mitglied$/);
});
