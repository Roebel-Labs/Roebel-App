// apps/web/tests/miniapp-index-plan.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { planIndex, pickSlug, type ExistingIndexedApp } from "../src/lib/miniapp/indexPlan";
import type { ParsedManifestFile } from "../src/lib/miniapp/manifestFile";

const parsed = (over: Partial<ParsedManifestFile["manifest"]> = {}, slugExplicit = false): ParsedManifestFile => ({
  owner: "0xaa00000000000000000000000000000000000001",
  slugExplicit,
  manifest: {
    slug: slugExplicit ? "stadtstack" : "",
    name: "Stadtstack",
    iconUrl: "",
    homeUrl: "https://s.example/",
    description: "",
    category: "games",
    tags: [],
    screenshots: [],
    permissions: [],
    primaryColor: "#00498B",
    ...over,
  },
});

const existing = (over: Partial<ExistingIndexedApp> = {}): ExistingIndexedApp => ({
  id: "app-1",
  slug: "stadtstack",
  status: "live",
  ownerWallet: "0xaa00000000000000000000000000000000000001",
  latestHash: "h1",
  ...over,
});

test("new origin → create with the given slug", () => {
  assert.deepEqual(planIndex(null, parsed(), "h1", "stadtstack"), { kind: "create", slug: "stadtstack" });
});

test("unchanged hash → touch, regardless of status", () => {
  for (const status of ["live", "pending", "rejected", "suspended"] as const) {
    assert.deepEqual(planIndex(existing({ status }), parsed(), "h1"), { kind: "touch" });
  }
});

test("changed + not live → update-direct", () => {
  for (const status of ["pending", "approved", "draft"] as const) {
    assert.deepEqual(planIndex(existing({ status }), parsed(), "h2"), { kind: "update-direct" });
  }
});

test("changed + live → stage version, mark pending update", () => {
  assert.deepEqual(planIndex(existing({ status: "live" }), parsed(), "h2"), { kind: "stage-version", markPendingUpdate: true });
});

test("changed + rejected/suspended → stage version only", () => {
  for (const status of ["rejected", "suspended"] as const) {
    assert.deepEqual(planIndex(existing({ status }), parsed(), "h2"), { kind: "stage-version", markPendingUpdate: false });
  }
});

test("different owner → conflict", () => {
  assert.throws(
    () => planIndex(existing({ ownerWallet: "0xbb00000000000000000000000000000000000002" }), parsed(), "h2"),
    (e: Error & { code?: string }) => e.code === "conflict" && /Besitzer/.test(e.message),
  );
});

test("pickSlug: derived slug gets -2.. suffix on collision", () => {
  const taken = new Set(["stadtstack", "stadtstack-2"]);
  assert.equal(pickSlug(parsed(), (s) => taken.has(s)), "stadtstack-3");
});

test("pickSlug: explicit slug collision → conflict", () => {
  assert.throws(
    () => pickSlug(parsed({}, true), () => true),
    (e: Error & { code?: string }) => e.code === "conflict",
  );
});

test("pickSlug: gives up after -9", () => {
  assert.throws(() => pickSlug(parsed(), () => true), (e: Error & { code?: string }) => e.code === "conflict");
});
