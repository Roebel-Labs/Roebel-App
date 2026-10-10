// apps/web/tests/miniapp-manifest-file.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseManifestFile,
  canonicalHash,
  slugify,
  WELL_KNOWN_PATH,
} from "../src/lib/miniapp/manifestFile";

const origin = "https://spiel.example.app";
const base = {
  owner: "0xAbCdEf0000000000000000000000000000000001",
  miniapp: {
    version: "1",
    name: "Stadtstack",
    homeUrl: "https://spiel.example.app/",
    category: "games",
  },
};

test("well-known path constant", () => {
  assert.equal(WELL_KNOWN_PATH, "/.well-known/roebel-miniapp.json");
});

test("parses a minimal manifest, lowercases owner, slug not explicit", () => {
  const p = parseManifestFile(base, origin);
  assert.equal(p.owner, "0xabcdef0000000000000000000000000000000001");
  assert.equal(p.manifest.name, "Stadtstack");
  assert.equal(p.manifest.category, "games");
  assert.equal(p.slugExplicit, false);
  assert.equal(p.manifest.slug, "");
});

test("explicit slug is kept and flagged", () => {
  const p = parseManifestFile({ ...base, miniapp: { ...base.miniapp, slug: "stadtstack-spiel" } }, origin);
  assert.equal(p.manifest.slug, "stadtstack-spiel");
  assert.equal(p.slugExplicit, true);
});

test("rejects missing or malformed owner", () => {
  assert.throws(() => parseManifestFile({ miniapp: base.miniapp }, origin), /owner/);
  assert.throws(() => parseManifestFile({ ...base, owner: "0x123" }, origin), /owner/);
});

test("rejects missing miniapp object", () => {
  assert.throws(() => parseManifestFile({ owner: base.owner }, origin), /miniapp/);
});

test("rejects homeUrl on another origin", () => {
  assert.throws(
    () => parseManifestFile({ ...base, miniapp: { ...base.miniapp, homeUrl: "https://evil.example/" } }, origin),
    /homeUrl/,
  );
});

test("rejects unsupported manifest version", () => {
  assert.throws(() => parseManifestFile({ ...base, miniapp: { ...base.miniapp, version: "9" } }, origin), /version/);
});

test("rejects non-object input", () => {
  assert.throws(() => parseManifestFile("nope", origin), /Manifest/);
});

test("canonicalHash ignores key order and whitespace", () => {
  const a = { b: 1, a: { y: [1, 2], x: "s" } };
  const b = JSON.parse(JSON.stringify({ a: { x: "s", y: [1, 2] }, b: 1 }, null, 4));
  assert.equal(canonicalHash(a), canonicalHash(b));
  assert.notEqual(canonicalHash(a), canonicalHash({ ...a, b: 2 }));
  assert.match(canonicalHash(a), /^[0-9a-f]{64}$/);
});

test("slugify", () => {
  assert.equal(slugify("Stadtstack Spiel!"), "stadtstack-spiel");
  assert.equal(slugify("Röbel Größe"), "roebel-groesse");
  assert.equal(slugify("  --A--  "), "a-app");
  assert.equal(slugify("X"), "x-app");
  assert.equal(slugify("x".repeat(80)).length, 60);
  assert.equal(slugify("!!!"), "app");
});
