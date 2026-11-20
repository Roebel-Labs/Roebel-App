import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "@roebel/card-design";
import { designerEnabled, InMemoryDesignStore, type DraftRow, type VersionRow } from "../src/lib/credentials/designs/store";

const ACCOUNT = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const DESIGN = TEMPLATES[0].design;

function draft(over: Partial<DraftRow> = {}): DraftRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    accountId: ACCOUNT,
    typeId: null,
    name: "Mitglied",
    kind: "membership",
    template: "schwarz",
    design: DESIGN,
    revision: 1,
    testSentAt: null,
    updatedBy: "0xa1",
    updatedAt: "2026-11-20T10:00:00.000Z",
    createdAt: "2026-11-20T10:00:00.000Z",
    ...over,
  };
}

function version(over: Partial<VersionRow> = {}): VersionRow {
  return {
    sha: "a".repeat(64),
    draftId: "11111111-1111-4111-8111-111111111111",
    typeId: "0x" + "1".repeat(64),
    version: 1,
    design: DESIGN,
    meta: { name: "Mitglied", description: "", kind: "membership", organisation: "Heimatverein", aiGenerated: false },
    previewPath: "credential-designs/x/a.png",
    actionId: null,
    status: "live",
    createdBy: "0xa1",
    createdAt: "2026-11-20T10:00:00.000Z",
    ...over,
  };
}

test("updateDraft: a stale revision is a conflict, the current one bumps the revision", async () => {
  const s = new InMemoryDesignStore();
  await s.insertDraft(draft());
  const first = await s.updateDraft(draft().id, { name: "Neu" }, 1);
  assert.ok(first && first !== "conflict");
  assert.equal(first.revision, 2);
  assert.equal(first.name, "Neu");
  assert.equal(await s.updateDraft(draft().id, { name: "Alt" }, 1), "conflict");
  assert.equal((await s.getDraft(draft().id))?.name, "Neu");
  // null = an internal patch without a revision check (does not bump).
  const quiet = await s.updateDraft(draft().id, { testSentAt: "2026-11-20T11:00:00.000Z" }, null);
  assert.ok(quiet && quiet !== "conflict");
  assert.equal(quiet.revision, 2);
  assert.equal(await s.updateDraft("22222222-2222-4222-8222-222222222222", { name: "x" }, 1), null);
});

test("liveVersionOfType returns the newest live version, versionByAction the pending one", async () => {
  const s = new InMemoryDesignStore();
  await s.insertDraft(draft());
  const typeId = "0x" + "1".repeat(64);
  await s.insertVersion(version({ sha: "a".repeat(64), version: 1, status: "superseded" }));
  await s.insertVersion(version({ sha: "b".repeat(64), version: 2, status: "live" }));
  await s.insertVersion(version({ sha: "c".repeat(64), version: 3, status: "pending", actionId: "act-3" }));
  assert.equal((await s.liveVersionOfType(typeId))?.sha, "b".repeat(64));
  assert.equal((await s.versionByAction("act-3"))?.sha, "c".repeat(64));
  assert.equal(await s.versionByAction("nope"), null);
  assert.equal((await s.versionsOf(draft().id)).map((v) => v.version).join(","), "3,2,1");
  assert.equal(await s.setVersionStatus("c".repeat(64), "live", undefined, ["pending"]), true);
  assert.equal(await s.setVersionStatus("c".repeat(64), "abandoned", undefined, ["pending"]), false);
  await assert.rejects(() => s.insertVersion(version({ sha: "d".repeat(64), version: 3 })), /version/);
});

test("assets are per account; deleteDraft removes its versions", async () => {
  const s = new InMemoryDesignStore();
  const asset = { sha: "e".repeat(64), accountId: ACCOUNT, kind: "logo" as const, storagePath: "p", mime: "image/png", width: 10, height: 10, ai: false, prompt: null, createdBy: "0xa1", createdAt: "2026-11-20T10:00:00.000Z" };
  await s.insertAsset(asset);
  await s.insertAsset(asset); // idempotent
  assert.equal((await s.assetsOf(ACCOUNT)).length, 1);
  assert.equal((await s.getAsset("e".repeat(64), ACCOUNT))?.kind, "logo");
  assert.equal(await s.getAsset("e".repeat(64), "8b3e4c90-2f5d-4e77-9c30-4d5e6f708192"), null);
  assert.ok(await s.getAsset("e".repeat(64)));
  await s.insertDraft(draft());
  await s.insertVersion(version());
  await s.deleteDraft(draft().id);
  assert.equal(await s.getDraft(draft().id), null);
  assert.equal(await s.getVersion("a".repeat(64)), null);
});

test("designerEnabled: only the string 'true' opens; errors keep it closed", async () => {
  assert.equal(await designerEnabled(async () => "true"), true);
  assert.equal(await designerEnabled(async () => " true "), true);
  assert.equal(await designerEnabled(async () => "false"), false);
  assert.equal(await designerEnabled(async () => null), false);
  assert.equal(await designerEnabled(async () => { throw new Error("db"); }), false);
});
