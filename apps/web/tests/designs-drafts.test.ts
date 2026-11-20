import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, type CardDesign } from "@roebel/card-design";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import { InMemoryDesignStore } from "../src/lib/credentials/designs/store";
import { deleteDraft, getDraft, listDesignOrgs, listDrafts, saveDraft, type DesignDeps, type DraftWithDesign } from "../src/lib/credentials/designs/drafts";
import { credentialStatus } from "../src/lib/credentials/status";
import { DESIGN_ACTIONS } from "../src/lib/credentials/caller";
import type { Caller } from "../src/lib/credentials/caller";

const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const OTHER = "8b3e4c90-2f5d-4e77-9c30-4d5e6f708192";
const OWNER = "0x00000000000000000000000000000000000000a1";
const ADMIN = "0x00000000000000000000000000000000000000a2";
const MEMBER = "0x00000000000000000000000000000000000000a3";
const OTHER_ADMIN = "0x00000000000000000000000000000000000000a4";
const DESIGN: CardDesign = TEMPLATES.find((t) => t.id === "schwarz")!.design;

function world(opts: { designer?: string | null } = {}) {
  const credStore = new InMemoryCredentialStore();
  credStore.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: "https://x/v.png", membersPublicColumn: null });
  credStore.seedAccount({ id: OTHER, accountType: "organisation", name: "Anglerclub", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  credStore.seedOwner(VEREIN, OWNER, "owner");
  credStore.seedOwner(VEREIN, ADMIN, "admin");
  credStore.seedOwner(VEREIN, MEMBER, "member");
  credStore.seedOwner(OTHER, OTHER_ADMIN, "admin");
  credStore.seedOwner(OTHER, OWNER, "member");
  const store = new InMemoryDesignStore();
  const setting = { value: opts.designer === undefined ? "true" : opts.designer };
  const d: DesignDeps = { store, credStore, settings: async () => setting.value, now: () => Date.parse("2026-11-20T10:00:00Z") };
  return { d, store, credStore, setting };
}

const caller = (wallet: string, action: Caller["action"] = "design_draft_save"): Caller => ({ ok: true, wallet, via: "chat_session", action, payload: {} });

function must<T>(r: { ok: true; data: T } | { ok: false; code: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : (r as { code: string }).code);
  return (r as { data: T }).data;
}

async function newDraft(d: DesignDeps, over: Record<string, unknown> = {}): Promise<DraftWithDesign> {
  return must(await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Mitgliedsausweis", kind: "membership", template: "schwarz", design: DESIGN, ...over }));
}

test("status JSON carries the designer switch", async () => {
  const settings: Record<string, string> = { credentials_enabled: "false", credential_designer_enabled: "true" };
  assert.deepEqual(await credentialStatus(async (k) => settings[k] ?? null, false), { enabled: false, configured: false, designer: true });
  assert.deepEqual(await credentialStatus(async () => { throw new Error("db"); }, true), { enabled: false, configured: true, designer: false });
});

test("DESIGN_ACTIONS lists the draft actions", () => {
  for (const a of ["design_orgs", "design_drafts_list", "design_draft_get", "design_draft_save", "design_draft_delete", "design_test_send", "design_publish", "design_assets_list"]) {
    assert.ok(DESIGN_ACTIONS.includes(a as never), a);
  }
});

test("designer switch off → 403 DESIGNER_OFF on every action", async () => {
  for (const value of [null, "false", "yes"]) {
    const { d } = world({ designer: value });
    for (const r of [
      await listDesignOrgs(d, caller(OWNER)),
      await listDrafts(d, caller(OWNER), { accountId: VEREIN }),
      await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Ausweis", kind: "membership", design: DESIGN }),
      await getDraft(d, caller(OWNER), { draftId: "11111111-1111-4111-8111-111111111111" }),
    ]) {
      assert.equal(r.ok, false);
      assert.equal((r as { status: number }).status, 403);
      assert.equal((r as { code: string }).code, "DESIGNER_OFF");
      assert.equal((r as { message: string }).message, "Der Ausweis-Designer ist noch nicht freigeschaltet.");
    }
  }
});

test("a plain member or a stranger may not draft", async () => {
  const { d } = world();
  const r = await saveDraft(d, caller(MEMBER), { accountId: VEREIN, name: "Ausweis", kind: "membership", design: DESIGN });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 403);
  assert.equal((r as { code: string }).code, "FORBIDDEN");
  const draft = await newDraft(d);
  const g = await getDraft(d, caller(OTHER_ADMIN), { draftId: draft.id });
  assert.equal((g as { status: number }).status, 403);
  const l = await listDrafts(d, caller(MEMBER), { accountId: VEREIN });
  assert.equal((l as { status: number }).status, 403);
});

test("save → get round-trip, then update with the current revision", async () => {
  const { d } = world();
  const created = await newDraft(d);
  assert.equal(created.revision, 1);
  assert.equal(created.liveVersion, null);
  assert.equal(created.pendingVersion, null);
  assert.equal(created.hasUnpublishedChanges, true);
  const got = must(await getDraft(d, caller(ADMIN), { draftId: created.id }));
  assert.deepEqual(got.design, DESIGN);
  assert.equal(got.name, "Mitgliedsausweis");
  const changed: CardDesign = { ...DESIGN, shine: { enabled: true, intensity: 0.9 } };
  const saved = must(await saveDraft(d, caller(ADMIN), { accountId: VEREIN, draftId: created.id, baseRevision: 1, name: "Mitglied 2027", kind: "membership", design: changed }));
  assert.equal(saved.revision, 2);
  assert.equal(saved.design.shine.intensity, 0.9);
  const list = must(await listDrafts(d, caller(OWNER), { accountId: VEREIN }));
  assert.deepEqual(list.map((x) => [x.name, x.revision]), [["Mitglied 2027", 2]]);
  assert.equal("design" in list[0], false);
  // The view names its org (a test link opened from a push needs it).
  assert.equal(list[0].accountId, VEREIN);
});

test("a stale baseRevision → 409 DRAFT_CONFLICT with the current draft", async () => {
  const { d } = world();
  const created = await newDraft(d);
  must(await saveDraft(d, caller(OWNER), { accountId: VEREIN, draftId: created.id, baseRevision: 1, name: "Studio", kind: "membership", design: DESIGN }));
  const r = await saveDraft(d, caller(ADMIN), { accountId: VEREIN, draftId: created.id, baseRevision: 1, name: "Handy", kind: "membership", design: DESIGN });
  assert.equal(r.ok, false);
  const f = r as { status: number; code: string; message: string; data: DraftWithDesign };
  assert.equal(f.status, 409);
  assert.equal(f.code, "DRAFT_CONFLICT");
  assert.equal(f.message, "Der Entwurf wurde inzwischen geändert.");
  assert.equal(f.data.name, "Studio");
  assert.equal(f.data.revision, 2);
  assert.deepEqual(f.data.design, DESIGN);
});

test("names, kinds, templates and designs are validated", async () => {
  const { d } = world();
  for (const name of ["A", "x".repeat(61), "  "]) {
    const r = await saveDraft(d, caller(OWNER), { accountId: VEREIN, name, kind: "membership", design: DESIGN });
    assert.equal((r as { message: string }).message, "Der Name muss 2 bis 60 Zeichen lang sein.");
  }
  assert.equal(((await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Ab", kind: "token" as never, design: DESIGN })) as { status: number }).status, 400);
  assert.equal(((await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Ab", kind: "badge", template: "nope", design: DESIGN })) as { status: number }).status, 400);
  const bad = await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Ab", kind: "badge", design: { schema: 2 } });
  assert.equal((bad as { code: string }).code, "INVALID_DESIGN");
});

test("an asset of another org is refused; own assets and built-ins pass", async () => {
  const { d, store } = world();
  const foreign = "f".repeat(64);
  const own = "e".repeat(64);
  const asset = (sha: string, accountId: string) => ({ sha, accountId, kind: "logo" as const, storagePath: "p", mime: "image/png", width: 10, height: 10, ai: false, prompt: null, createdBy: "0x", createdAt: "2026-11-20T10:00:00.000Z" });
  await store.insertAsset(asset(foreign, OTHER));
  await store.insertAsset(asset(own, VEREIN));
  const withImage = (assetId: string): CardDesign => ({
    ...DESIGN,
    layers: [...DESIGN.layers, { id: "logo-x", type: "image", assetId, role: "logo", x: 10, y: 10, w: 100, h: 100, rotation: 0, opacity: 1, shine: false }],
  });
  const r = await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Logo", kind: "badge", design: withImage(foreign) });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 400);
  must(await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Logo", kind: "badge", design: withImage(own) }));
  must(await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Logo", kind: "badge", design: withImage("builtin:logo-slot") }));
  const bg: CardDesign = { ...DESIGN, background: { kind: "image", assetId: foreign, fit: "cover" } };
  assert.equal(((await saveDraft(d, caller(OWNER), { accountId: VEREIN, name: "Bild", kind: "badge", design: bg })) as { status: number }).status, 400);
});

test("a published draft cannot be deleted; an unpublished one can", async () => {
  const { d, store } = world();
  const a = await newDraft(d);
  must(await deleteDraft(d, caller(ADMIN), { draftId: a.id }));
  assert.equal(await store.getDraft(a.id), null);
  const b = await newDraft(d);
  await store.updateDraft(b.id, { typeId: "0x" + "1".repeat(64) }, null);
  const r = await deleteDraft(d, caller(OWNER), { draftId: b.id });
  assert.equal((r as { status: number }).status, 409);
  assert.equal((r as { message: string }).message, "Veröffentlichte Ausweise lassen sich nicht löschen, nur stilllegen.");
});

test("design_orgs lists only owner/admin orgs and needs no register", async () => {
  const { d } = world();
  // No credentialDeps / registry anywhere in DesignDeps: drafting works with the register unconfigured.
  assert.deepEqual(must(await listDesignOrgs(d, caller(OWNER))), [{ accountId: VEREIN, name: "Heimatverein", avatarUrl: "https://x/v.png", role: "owner" }]);
  assert.deepEqual(must(await listDesignOrgs(d, caller(OTHER_ADMIN))).map((o) => o.role), ["admin"]);
  assert.deepEqual(must(await listDesignOrgs(d, caller(MEMBER))), []);
});
