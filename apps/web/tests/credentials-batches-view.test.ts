import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId } from "@netizen-labs/credential-registry";
import type { Address, Hex } from "viem";
import { batchRows, delegateRows } from "../src/lib/credentials/views";
import type { ActionView, BatchView, Deps } from "../src/lib/credentials/actions";
import { listActions, listDelegatesForOrg } from "../src/lib/credentials/actions";
import { prepareBatch } from "../src/lib/credentials/batch";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import type { Caller } from "../src/lib/credentials/caller";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const TYPE = `0x${"aa".repeat(32)}` as Hex;

function action(id: string, status: ActionView["status"], createdAt: string, title: string, batches: BatchView[]): ActionView {
  return {
    id, status, createdAt, expiresAt: createdAt, via: "dashboard", preparedByMe: true, confirmedByMe: false, txHash: null, error: null,
    summary: { title, lines: [], orgName: "Heimatverein" }, batches,
  };
}

function batch(id: string, actionId: string | null, status: string, extra: Partial<BatchView> = {}): BatchView {
  return { id, actionId, typeId: TYPE, count: 3, status, invited: 3, accepted: 1, revoked: 0, hasOpenLinks: false, createdAt: "2026-11-01T10:00:00.000Z", ...extra };
}

test("batchRows maps statuses to the German labels and sorts newest first", () => {
  const actions = [
    action("a1", "awaiting_confirmation", "2026-11-10T10:00:00.000Z", "3 Ausweise ausstellen: Mitglied", [batch("b1", "a1", "prepared")]),
    action("a2", "done", "2026-11-12T10:00:00.000Z", "2 Ausweise ausstellen: Vorstand", [batch("b2", "a2", "onchain")]),
    action("a3", "done", "2026-11-05T10:00:00.000Z", "5 Abzeichen vergeben: Sommerfest", [batch("b3", "a3", "revoked")]),
    action("a4", "cancelled", "2026-11-11T10:00:00.000Z", "1 Ausweis ausstellen: Mitglied", [batch("b4", "a4", "cancelled")]),
    action("a5", "expired", "2026-11-09T10:00:00.000Z", "1 Ausweis ausstellen: Mitglied", [batch("b5", "a5", "cancelled")]),
    action("a6", "failed", "2026-11-08T10:00:00.000Z", "1 Ausweis ausstellen: Mitglied", [batch("b6", "a6", "prepared")]),
    action("a7", "submitted", "2026-11-13T10:00:00.000Z", "4 Ausweise ausstellen: Mitglied", [batch("b7", "a7", "prepared")]),
    // An action without a batch (type change) is not a row.
    action("a8", "done", "2026-11-14T10:00:00.000Z", "Ausweis „Mitglied“ anlegen", []),
  ];
  const rows = batchRows(actions, actions.flatMap((a) => a.batches));
  assert.deepEqual(rows.map((r) => [r.id, r.state]), [
    ["b7", "Wartet auf Bestätigung"],
    ["b2", "Eingetragen"],
    ["b4", "Verworfen"],
    ["b1", "Wartet auf Bestätigung"],
    ["b5", "Abgelaufen"],
    ["b6", "Fehlgeschlagen"],
    ["b3", "Widerrufen"],
  ]);
  assert.equal(rows[1].title, "2 Ausweise ausstellen: Vorstand");
  assert.equal(rows[1].when, "2026-11-12T10:00:00.000Z");
  assert.deepEqual(rows[1].counts, { invited: 3, accepted: 1, revoked: 0 });
  // A batch the node issued (its action is not listed) still shows, from its own row.
  const orphan = batchRows([], [batch("b9", null, "onchain", { createdAt: "2026-11-20T10:00:00.000Z" })]);
  assert.deepEqual(orphan.map((r) => [r.id, r.state, r.when]), [["b9", "Eingetragen", "2026-11-20T10:00:00.000Z"]]);
});

test("letters is offered only while open claim-key invitations exist", () => {
  const a = action("a1", "done", "2026-11-10T10:00:00.000Z", "t", [
    batch("open", "a1", "onchain", { hasOpenLinks: true }),
    batch("closed", "a1", "onchain", { hasOpenLinks: false }),
    batch("revoked", "a1", "revoked", { hasOpenLinks: true }),
  ]);
  const rows = batchRows([a], a.batches);
  const by = Object.fromEntries(rows.map((r) => [r.id, r.letters]));
  assert.deepEqual(by, { open: true, closed: false, revoked: false });
});

test("delegateRows never outputs an address-looking string", () => {
  const addr = "0x1234567890abcdef1234567890abcdef12345678";
  const rows = delegateRows([
    { delegate: addr, label: "Röbel-Server (sofortige Abzeichen)", displayName: null, typeName: "Dabei: Sommerfest" },
    { delegate: addr, label: "Türscanner", displayName: "Kasse Nord", typeName: "Mitglied" },
    { delegate: addr, label: null, displayName: null, typeName: "Mitglied" },
    { delegate: addr, label: addr, displayName: addr.toUpperCase().replace("0X", "0x"), typeName: "Mitglied" },
  ]);
  assert.deepEqual(rows.map((r) => r.who), ["Röbel-Server (sofortige Abzeichen)", "Kasse Nord", "Unbekanntes Konto", "Unbekanntes Konto"]);
  for (const r of rows) for (const v of Object.values(r)) assert.doesNotMatch(String(v), /0x[0-9a-f]{6}/i);
});

// ── server: actions_list batches and the delegates list ─────────────────────────

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
  store.seedOwner(VEREIN, wallet(5), "member");
  store.seedUser({ wallet: OWNER, displayName: "Olga Owner", avatarUrl: null });
  store.seedUser({ wallet: wallet(5), displayName: "Kasse Nord", avatarUrl: null });
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

test("actions_list returns each action's batches with counts and open links", async () => {
  const w = world();
  const r = await prepareBatch(w.d, caller("batch_prepare"), {
    accountId: VEREIN,
    typeId: TYPE_ID,
    recipients: [{ kind: "account", wallet: wallet(1) }, { kind: "account", wallet: wallet(2) }, { kind: "contact", name: "Erika" }],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  await w.store.updateBatch(r.data.batchId, { status: "onchain", chainBatchId: "3" });
  for (const i of await w.store.listInvitations({ batchId: r.data.batchId })) {
    await w.store.updateInvitation(i.id, { status: i.recipientWallet === wallet(1) ? "accepted" : i.recipientWallet === wallet(2) ? "revoked" : "invited" });
  }
  const list = await listActions(w.d, caller("actions_list"), VEREIN);
  assert.equal(list.ok, true);
  if (!list.ok) return;
  const b = list.data[0].batches;
  assert.equal(b.length, 1);
  assert.deepEqual(
    { id: b[0].id, actionId: b[0].actionId, count: b[0].count, status: b[0].status, invited: b[0].invited, accepted: b[0].accepted, revoked: b[0].revoked, hasOpenLinks: b[0].hasOpenLinks },
    { id: r.data.batchId, actionId: r.data.actionId, count: 3, status: "onchain", invited: 3, accepted: 1, revoked: 1, hasOpenLinks: true },
  );
});

test("delegates_list names delegates and members by display name and lists only active delegates", async () => {
  const w = world();
  await w.store.setDelegate({ typeId: TYPE_ID, delegate: wallet(5), label: "Türscanner", active: true });
  await w.store.setDelegate({ typeId: TYPE_ID, delegate: wallet(6), label: "Alt", active: false });
  const r = await listDelegatesForOrg(w.d, caller("delegates_list"), { accountId: VEREIN });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.data.delegates.map((x) => [x.typeName, x.label, x.displayName]), [["Mitglied", "Türscanner", "Kasse Nord"]]);
  assert.deepEqual(r.data.members.map((m) => m.displayName).sort(), ["Kasse Nord", "Olga Owner"]);
  const forbidden = await listDelegatesForOrg(w.d, { ...caller("delegates_list"), wallet: wallet(5) }, { accountId: VEREIN });
  assert.equal(forbidden.ok, false);
});
