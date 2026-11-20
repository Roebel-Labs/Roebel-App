import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { TEMPLATES, type CardDesign } from "@roebel/card-design";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import { InMemoryDesignStore } from "../src/lib/credentials/designs/store";
import { listAssets, sanitiseSvg, storeAsset, type AssetDeps, type AssetStorage, type AssetView } from "../src/lib/credentials/designs/assets";
import { renderPreview } from "../src/lib/credentials/designs/render";
import type { Caller } from "../src/lib/credentials/caller";

const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const OWNER = "0x00000000000000000000000000000000000000a1";
const MEMBER = "0x00000000000000000000000000000000000000a3";

function world() {
  const credStore = new InMemoryCredentialStore();
  credStore.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  credStore.seedOwner(VEREIN, OWNER, "owner");
  credStore.seedOwner(VEREIN, MEMBER, "member");
  const files = new Map<string, { bytes: Uint8Array; mime: string }>();
  const storage: AssetStorage = {
    put: async (p, bytes, mime) => void files.set(p, { bytes, mime }),
    get: async (p) => files.get(p)?.bytes ?? null,
    publicUrl: (p) => `https://storage.test/${p}`,
  };
  const d: AssetDeps = { store: new InMemoryDesignStore(), credStore, settings: async () => "true", now: () => Date.parse("2026-11-20T10:00:00Z"), storage };
  return { d, files };
}

const caller = (wallet = OWNER): Caller => ({ ok: true, wallet, via: "chat_session", action: "design_asset_upload", payload: {} });

function must<T>(r: { ok: true; data: T } | { ok: false; code: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : (r as { code: string }).code);
  return (r as { data: T }).data;
}

const png = async (w = 40, h = 20) => new Uint8Array(await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 73, b: 139, alpha: 1 } } }).png().toBuffer());

test("a PNG is stored once and deduplicated by sha", async () => {
  const { d, files } = world();
  const bytes = await png();
  const a = must(await storeAsset(d, caller(), { accountId: VEREIN, kind: "logo", bytes, mime: "image/png" }));
  assert.match(a.sha, /^[0-9a-f]{64}$/);
  assert.equal(a.width, 40);
  assert.equal(a.height, 20);
  assert.equal(a.ai, false);
  assert.ok(a.url.endsWith(`/api/credentials/designs/assets/${a.sha}`));
  assert.deepEqual([...files.keys()], [`credential-designs/${VEREIN}/${a.sha}.png`]);
  const b = must(await storeAsset(d, caller(), { accountId: VEREIN, kind: "logo", bytes, mime: "image/png" }));
  assert.equal(b.sha, a.sha);
  assert.equal(files.size, 1);
  assert.equal((must(await listAssets(d, caller(), { accountId: VEREIN })) as AssetView[]).length, 1);
});

test("9 MB is refused, so is HTML and a type that does not match the bytes", async () => {
  const { d, files } = world();
  const big = new Uint8Array(9 * 1024 * 1024);
  const r = await storeAsset(d, caller(), { accountId: VEREIN, kind: "image", bytes: big, mime: "image/png" });
  assert.equal(r.ok, false);
  assert.equal((r as { message: string }).message, "Das Bild ist zu groß (höchstens 8 MB).");
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const h = await storeAsset(d, caller(), { accountId: VEREIN, kind: "image", bytes: html, mime: "text/html" });
  assert.equal(h.ok, false);
  assert.equal((h as { code: string }).code, "BAD_FORMAT");
  const disguised = await storeAsset(d, caller(), { accountId: VEREIN, kind: "image", bytes: html, mime: "image/png" });
  assert.equal(disguised.ok, false);
  assert.equal(files.size, 0);
});

test("a member may not upload; the switch gates uploads", async () => {
  const { d } = world();
  const r = await storeAsset(d, caller(MEMBER), { accountId: VEREIN, kind: "logo", bytes: await png(), mime: "image/png" });
  assert.equal((r as { status: number }).status, 403);
  const off = { ...d, settings: async () => "false" };
  assert.equal(((await storeAsset(off, caller(), { accountId: VEREIN, kind: "logo", bytes: await png(), mime: "image/png" })) as { code: string }).code, "DESIGNER_OFF");
});

test("SVG: script, handlers and external links are removed, the stored file is a PNG", async () => {
  const evil =
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50" onload="alert(1)">' +
    '<script>alert("x")</script><rect width="100" height="50" fill="#00498b" onclick="steal()"/>' +
    '<image href="https://evil.example/track.png" width="10" height="10"/><use xlink:href="file:///etc/passwd#a"/>' +
    '<a href="javascript:alert(1)"><circle cx="5" cy="5" r="4" fill="url(#g)"/></a></svg>';
  const clean = sanitiseSvg(evil);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /onload|onclick/i);
  assert.doesNotMatch(clean, /evil\.example|file:|javascript:/i);
  assert.match(clean, /url\(#g\)/);
  const { d, files } = world();
  const a = must(await storeAsset(d, caller(), { accountId: VEREIN, kind: "sticker", bytes: new TextEncoder().encode(evil), mime: "image/svg+xml" }));
  const [[path, file]] = [...files.entries()];
  assert.ok(path.endsWith(".png"));
  assert.equal(file.mime, "image/png");
  assert.equal((await sharp(file.bytes).metadata()).format, "png");
  assert.equal(Math.max(a.width ?? 0, a.height ?? 0), 2048);
  assert.doesNotMatch(Buffer.from(file.bytes).toString("latin1"), /<script/);
});

test("a large raster is scaled to 2048 px on the long side", async () => {
  const { d } = world();
  const a = must(await storeAsset(d, caller(), { accountId: VEREIN, kind: "background", bytes: await png(3000, 1500), mime: "image/png" }));
  assert.deepEqual([a.width, a.height], [2048, 1024]);
});

test("renderPreview never draws a personal field", async () => {
  const base: CardDesign = TEMPLATES.find((t) => t.id === "schwarz")!.design;
  const withField: CardDesign = {
    ...base,
    layers: [
      ...base.layers,
      { id: "holder", type: "field", field: "holderName", sampleText: "Erika Mustermann", x: 60, y: 420, w: 600, h: 60, rotation: 0, opacity: 1, shine: false, font: "mona-bold", size: 40, color: "#ffffff", align: "left", uppercase: false, letterSpacing: 0 },
    ],
  };
  const withoutField: CardDesign = { ...base, layers: [...base.layers] };
  const a = await renderPreview(withField, async () => null);
  const b = await renderPreview(withoutField, async () => null);
  assert.equal((await sharp(a).metadata()).width, 924);
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
});
