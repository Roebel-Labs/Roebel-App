import { test } from "node:test";
import assert from "node:assert/strict";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import type { RegisterLog } from "@netizen-labs/credential-registry";
import { TEMPLATES, type CardDesign } from "@roebel/card-design";
import type { Address, Hex } from "viem";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import { cancelAction, prepareTypeAction, type Deps } from "../src/lib/credentials/actions";
import type { Caller } from "../src/lib/credentials/caller";
import type { Notifier } from "../src/lib/credentials/notify";
import { ACTION_TTL_MS } from "../src/lib/credentials/config";
import { applyConfirmedAction, applyRegisterLogs, type SyncDeps } from "../src/lib/credentials/sync";
import { mine } from "../src/lib/credentials/holder";
import { metadataFor } from "../src/lib/credentials/metadata";
import { InMemoryDesignStore } from "../src/lib/credentials/designs/store";
import { getDraft, saveDraft, type DraftWithDesign } from "../src/lib/credentials/designs/drafts";
import { promoteDesignVersion, publishDraft, sendTest, type PublishDeps } from "../src/lib/credentials/designs/publish";

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const OWNER = "0x00000000000000000000000000000000000000a1";
const ADMIN = "0x00000000000000000000000000000000000000a2";
const HOLDER = "0x00000000000000000000000000000000000000b1";
const T0 = Date.parse("2026-11-20T10:00:00Z");
const DESIGN: CardDesign = TEMPLATES.find((t) => t.id === "schwarz")!.design;
const FAKE_PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function world() {
  const credStore = new InMemoryCredentialStore();
  credStore.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  credStore.seedOwner(VEREIN, OWNER, "owner");
  credStore.seedOwner(VEREIN, ADMIN, "admin");
  const store = new InMemoryDesignStore();
  const pushes: Parameters<Notifier["push"]>[0][] = [];
  const notify: Notifier = { push: async (p) => void pushes.push(p) };
  let now = T0;
  const registered = orgIdFromUuid(VEREIN).toLowerCase();
  const reader = {
    isOrgRegistered: async (orgId: Hex) => orgId.toLowerCase() === registered,
    canManage: async (orgId: Hex, a: Address) => orgId.toLowerCase() === registered && [OWNER, ADMIN].includes(a.toLowerCase()),
    orgPrivateOnly: async () => false,
    leafRevoked: async () => false,
    holdsMany: async () => [],
  };
  const syncDeps: SyncDeps = {
    store: credStore,
    getLogs: async () => [],
    head: async () => 100n,
    registry: REGISTRY,
    deployBlock: 1n,
    deliver: async () => {},
    notify,
    designs: store,
  };
  const register: Deps = {
    store: credStore,
    reader: reader as never,
    receipt: async () => null,
    head: async () => 100n,
    notify,
    now: () => now,
    registry: REGISTRY,
    applyConfirmed: (actionId, logs) => applyConfirmedAction(syncDeps, actionId, logs),
    designs: store,
  };
  const files = new Map<string, Uint8Array>();
  const renders: CardDesign[] = [];
  const d: PublishDeps = {
    store,
    credStore,
    settings: async () => "true",
    now: () => now,
    storage: { put: async (p, b) => void files.set(p, b), get: async (p) => files.get(p) ?? null, publicUrl: (p) => `https://storage.test/${p}` },
    notify,
    register,
    render: async (design) => {
      renders.push(design);
      return FAKE_PNG;
    },
  };
  return { d, store, credStore, pushes, files, renders, register, syncDeps, advance: (ms: number) => (now += ms) };
}

const caller = (wallet: string, action: Caller["action"] = "design_publish"): Caller => ({ ok: true, wallet, via: "chat_session", action, payload: {} });

function must<T>(r: { ok: true; data: T } | { ok: false; code: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : (r as { code: string }).code);
  return (r as { data: T }).data;
}

async function newDraft(d: PublishDeps): Promise<DraftWithDesign> {
  return must(await saveDraft(d, caller(OWNER, "design_draft_save"), { accountId: VEREIN, name: "Mitgliedsausweis", kind: "membership", template: "schwarz", design: DESIGN }));
}

/** What the phone + chain do for a confirmed action: the action is done and (for create) the type is on chain. */
async function confirm(w: ReturnType<typeof world>, actionId: string) {
  const a = (await w.credStore.getAction(actionId))!;
  for (const s of a.steps) {
    if (s.fn === "createType") {
      const t = (await w.credStore.listTypes({ accountId: VEREIN })).find((x) => x.localId.toLowerCase() === s.localId.toLowerCase())!;
      await w.credStore.updateType(t.typeId, { chainStatus: "onchain" });
    }
  }
  await w.credStore.updateAction(actionId, { status: "submitted" });
  await applyConfirmedAction(w.syncDeps, actionId, []);
}

async function holderOf(w: ReturnType<typeof world>, typeId: Hex) {
  const batchId = "33333333-3333-4333-8333-333333333333";
  await w.credStore.insertBatchWithInvitations(
    { id: batchId, actionId: null, typeId, root: `0x${"ab".repeat(32)}` as Hex, count: 1, source: "people" },
    [
      {
        id: "44444444-4444-4444-8444-444444444444",
        typeId,
        leafKind: "account",
        subject: HOLDER,
        salt: `0x${"01".repeat(32)}` as Hex,
        leafHash: `0x${"02".repeat(32)}` as Hex,
        validUntil: "0",
        proof: [],
        recipientWallet: HOLDER,
        recipientEmail: null,
        recipientUserId: null,
        displayName: "Erika",
        tokenHash: null,
        tokenEnc: null,
        claimKeyEnc: null,
      } as never,
    ],
  );
  await w.credStore.updateBatch(batchId, { status: "onchain", chainBatchId: "1" });
  const inv = (await w.credStore.listInvitations({ batchId }))[0];
  await w.credStore.updateInvitation(inv.id, { status: "accepted" });
}

test("first publish prepares createType with the version URL; confirming makes it live", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const r = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  assert.equal(r.version, 1);
  assert.match(r.sha, /^[0-9a-f]{64}$/);
  const action = (await w.credStore.getAction(r.actionId))!;
  const create = action.steps.find((s) => s.fn === "createType");
  assert.ok(create && create.fn === "createType");
  assert.ok(create.config.metadataURI.endsWith(`/api/credentials/designs/${r.sha}`));
  assert.equal(action.preparedVia, "dashboard");
  // Rendered once (public mode is render.ts's job), stored under the org.
  assert.equal(w.renders.length, 1);
  assert.ok(w.files.has(`credential-designs/${VEREIN}/previews/${r.sha}.png`));
  const v = (await w.store.getVersion(r.sha))!;
  assert.equal(v.status, "pending");
  assert.equal(v.actionId, r.actionId);
  const afterPublish = must(await getDraft(w.d, caller(OWNER, "design_draft_get"), { draftId: draft.id }));
  assert.ok(afterPublish.typeId);
  assert.equal(v.typeId, afterPublish.typeId);
  assert.equal(afterPublish.pendingVersion, 1);

  await confirm(w, r.actionId);
  assert.equal((await w.store.getVersion(r.sha))!.status, "live");
  const typeId = afterPublish.typeId as Hex;
  const t = (await w.credStore.getType(typeId))!;
  assert.ok(t.imageUrl?.endsWith(`/api/credentials/designs/${r.sha}/image`));
  const view = must(await getDraft(w.d, caller(OWNER, "design_draft_get"), { draftId: draft.id }));
  assert.deepEqual([view.liveVersion, view.pendingVersion, view.hasUnpublishedChanges], [1, null, false]);

  // The holder's wallet gets the live design; the type metadata carries it too.
  await holderOf(w, typeId);
  const m = must(await mine({ store: w.credStore, reader: { orgPrivateOnly: async () => false, holdsMany: async () => [] } as never, registry: REGISTRY, now: () => T0, designs: w.store }, caller(HOLDER, "mine")));
  assert.equal(m.invitations.length, 1);
  assert.deepEqual(m.invitations[0].design, DESIGN);
  assert.equal(m.invitations[0].designSha, r.sha);
  const meta = (await metadataFor(w.credStore, typeId, T0, w.store))!;
  assert.deepEqual(meta.properties.design, DESIGN);
  assert.ok(meta.image?.endsWith(`/api/credentials/designs/${r.sha}/image`));
});

test("a second publish prepares exactly one updateType with the new URI; while pending → 409", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const first = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  await confirm(w, first.actionId);
  const current = must(await getDraft(w.d, caller(OWNER, "design_draft_get"), { draftId: draft.id }));
  const changed: CardDesign = { ...DESIGN, shine: { enabled: true, intensity: 0.95 } };
  must(await saveDraft(w.d, caller(ADMIN, "design_draft_save"), { accountId: VEREIN, draftId: draft.id, baseRevision: current.revision, name: current.name, kind: "membership", design: changed }));
  const second = must(await publishDraft(w.d, caller(ADMIN), { draftId: draft.id }));
  assert.equal(second.version, 2);
  assert.notEqual(second.sha, first.sha);
  const steps = (await w.credStore.getAction(second.actionId))!.steps;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].fn, "updateType");
  assert.ok(steps[0].fn === "updateType" && steps[0].config.metadataURI.endsWith(`/api/credentials/designs/${second.sha}`));

  const again = await publishDraft(w.d, caller(OWNER), { draftId: draft.id });
  assert.equal(again.ok, false);
  assert.equal((again as { status: number }).status, 409);
  assert.equal((again as { code: string }).code, "ALREADY_PENDING");
  assert.equal((again as { message: string }).message, "Eine Veröffentlichung wartet schon auf Bestätigung.");

  await confirm(w, second.actionId);
  assert.equal((await w.store.getVersion(first.sha))!.status, "superseded");
  assert.equal((await w.store.getVersion(second.sha))!.status, "live");
});

test("cancelling the publish keeps the old version live, the new one abandoned, the draft editable", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const first = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  await confirm(w, first.actionId);
  let cur = must(await getDraft(w.d, caller(OWNER, "design_draft_get"), { draftId: draft.id }));
  must(await saveDraft(w.d, caller(OWNER, "design_draft_save"), { accountId: VEREIN, draftId: draft.id, baseRevision: cur.revision, name: "Mitglied neu", kind: "membership", design: DESIGN }));
  const second = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  must(await cancelAction(w.register, caller(OWNER, "action_cancel"), second.actionId));
  assert.equal((await w.store.getVersion(first.sha))!.status, "live");
  assert.equal((await w.store.getVersion(second.sha))!.status, "abandoned");
  cur = must(await getDraft(w.d, caller(OWNER, "design_draft_get"), { draftId: draft.id }));
  assert.deepEqual([cur.liveVersion, cur.pendingVersion, cur.hasUnpublishedChanges], [1, null, true]);
  must(await saveDraft(w.d, caller(OWNER, "design_draft_save"), { accountId: VEREIN, draftId: draft.id, baseRevision: cur.revision, name: "Mitglied neu 2", kind: "membership", design: DESIGN }));
  // The type keeps the live version's name and image.
  const t = (await w.credStore.getType(cur.typeId as Hex))!;
  assert.equal(t.name, "Mitgliedsausweis");
  assert.ok(t.imageUrl?.endsWith(`${first.sha}/image`));
  // A fresh publish takes version 3 (2 stays reserved by the abandoned row).
  assert.equal(must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id })).version, 3);
});

test("an expired first publish is given up; the next publish prepares a fresh createType", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const first = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  w.advance(ACTION_TTL_MS + 1000);
  const view = must(await getDraft(w.d, caller(OWNER, "design_draft_get"), { draftId: draft.id }));
  assert.equal(view.pendingVersion, null);
  assert.equal(view.typeId, null);
  assert.equal((await w.store.getVersion(first.sha))!.status, "abandoned");
  const second = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  assert.equal((await w.credStore.getAction(second.actionId))!.steps.at(-1)!.fn, "createType");
});

test("an unchanged design → 409 NO_CHANGES", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const first = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  await confirm(w, first.actionId);
  const r = await publishDraft(w.d, caller(OWNER), { draftId: draft.id });
  assert.equal((r as { status: number }).status, 409);
  assert.equal((r as { code: string }).code, "NO_CHANGES");
  assert.equal((r as { message: string }).message, "Keine Änderungen seit der letzten Veröffentlichung.");
});

test("publishing needs the register; drafting does not", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const r = await publishDraft({ ...w.d, register: null }, caller(OWNER), { draftId: draft.id });
  assert.equal((r as { code: string }).code, "NOT_CONFIGURED");
  assert.equal(w.store.versions.size, 0);
});

test("sendTest pushes to the caller and co-admins and writes nothing to credential_actions", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const r = must(await sendTest(w.d, caller(ADMIN, "design_test_send"), { draftId: draft.id }));
  assert.equal(r.sentAt, new Date(T0).toISOString());
  assert.equal((await w.credStore.listActions({ accountId: VEREIN })).length, 0);
  assert.equal(w.pushes.length, 1);
  const p = w.pushes[0];
  assert.equal(p.type, "design_test");
  assert.equal(p.title, "Entwurf zum Testen: Mitgliedsausweis");
  assert.deepEqual(new Set(p.wallets), new Set([OWNER, ADMIN]));
  assert.equal(p.data.url, `roebel://org/credentials/design-test?draft=${draft.id}`);
  assert.equal(must(await getDraft(w.d, caller(OWNER, "design_draft_get"), { draftId: draft.id })).testSentAt, r.sentAt);
});

test("the chain sync promotes a version from TypeConfigured even when the receipt never came", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const first = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  await confirm(w, first.actionId);
  const cur = must(await getDraft(w.d, caller(OWNER, "design_draft_get"), { draftId: draft.id }));
  must(await saveDraft(w.d, caller(OWNER, "design_draft_save"), { accountId: VEREIN, draftId: draft.id, baseRevision: cur.revision, name: "Neu", kind: "membership", design: DESIGN }));
  const second = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  const step = (await w.credStore.getAction(second.actionId))!.steps[0];
  assert.ok(step.fn === "updateType");
  const log: RegisterLog = {
    eventName: "TypeConfigured",
    args: { typeId: cur.typeId, config: { metadataURI: step.config.metadataURI, defaultValidity: 0n, claimStart: 0n, claimEnd: 0n, supplyCap: 0, publicClaim: true } },
    blockNumber: 200n,
    logIndex: 0,
  };
  await applyRegisterLogs(w.syncDeps, [log]);
  assert.equal((await w.store.getVersion(second.sha))!.status, "live");
  assert.equal((await w.store.getVersion(first.sha))!.status, "superseded");
  assert.equal((await w.credStore.getType(cur.typeId as Hex))!.name, "Neu");
  // Promoting again is a no-op.
  await promoteDesignVersion(w.store, w.credStore, second.actionId);
  assert.equal((await w.store.getVersion(second.sha))!.status, "live");
});

test("a plain config edit of a designed type keeps the live design URL on chain", async () => {
  const w = world();
  const draft = await newDraft(w.d);
  const first = must(await publishDraft(w.d, caller(OWNER), { draftId: draft.id }));
  await confirm(w, first.actionId);
  const typeId = (await w.store.getDraft(draft.id))!.typeId as Hex;
  const r = must(await prepareTypeAction(w.register, caller(OWNER, "type_prepare"), { accountId: VEREIN, op: "update", typeId, supplyCap: 50 }));
  const step = (await w.credStore.getAction(r.actionId!))!.steps[0];
  assert.ok(step.fn === "updateType" && step.config.metadataURI.endsWith(`/api/credentials/designs/${first.sha}`));
  assert.equal(step.fn === "updateType" && step.config.supplyCap, 50);
});
