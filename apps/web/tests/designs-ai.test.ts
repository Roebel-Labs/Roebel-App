import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { CARD_H, CARD_W } from "@roebel/card-design";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import { InMemoryDesignStore } from "../src/lib/credentials/designs/store";
import type { AssetStorage } from "../src/lib/credentials/designs/assets";
import {
  AI_DAILY_LIMITS,
  aiUsageToday,
  berlinDayStart,
  BACKGROUND_PROMPT_PREFIX,
  generateBackground,
  generateSticker,
  scrubPrompt,
  STICKER_PROMPT_PREFIX,
  STICKER_REMOVAL_NOTICE,
  type AiDeps,
  type AiGenerateInput,
} from "../src/lib/credentials/designs/ai";
import type { Caller } from "../src/lib/credentials/caller";

const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const OWNER = "0x00000000000000000000000000000000000000a1";
const MEMBER = "0x00000000000000000000000000000000000000a3";
const NOW = Date.parse("2026-11-20T10:00:00Z");

/** A distinct noisy PNG per call (so the sha differs after any re-encode and every call inserts a row). */
async function png(w = 64, h = 36): Promise<Uint8Array> {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  return new Uint8Array(await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer());
}

function world(over: Partial<AiDeps> = {}) {
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
  const calls: AiGenerateInput[] = [];
  const store = new InMemoryDesignStore();
  const d: AiDeps = {
    store,
    credStore,
    settings: async () => "true",
    now: () => NOW,
    storage,
    generate: async (input) => {
      calls.push(input);
      return input.aspectRatio === "1:1" ? png(48, 48) : png();
    },
    removeBackground: async (bytes) => bytes,
    ...over,
  };
  return { d, files, calls, store };
}

const caller = (wallet = OWNER): Caller => ({ ok: true, wallet, via: "chat_session", action: "design_ai_background", payload: {} });

function must<T>(r: { ok: true; data: T } | { ok: false; code: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : (r as { code: string }).code);
  return (r as { data: T }).data;
}

test("background: stored as an AI asset with the prompt, marked, suggested as cover", async () => {
  const { d, files, calls, store } = world();
  const r = must(await generateBackground(d, caller(), { accountId: VEREIN, prompt: "Müritz bei Sonnenuntergang" }));
  assert.equal(r.asset.ai, true);
  assert.equal(r.asset.kind, "background");
  assert.deepEqual(r.background, { kind: "image", assetId: r.asset.sha, fit: "cover" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].aspectRatio, "16:9");
  assert.ok(calls[0].prompt.startsWith(BACKGROUND_PROMPT_PREFIX));
  assert.ok(calls[0].prompt.includes("Müritz bei Sonnenuntergang"));
  const row = await store.getAsset(r.asset.sha, VEREIN);
  assert.equal(row?.ai, true);
  assert.equal(row?.prompt, "Müritz bei Sonnenuntergang");
  // AI Act Art. 50(2): the stored file itself carries the synthetic-media marking.
  const stored = [...files.values()][0];
  assert.ok(Buffer.from(stored.bytes).toString("latin1").includes("trainedAlgorithmicMedia"));
});

test("background: tileable asks for a square seamless texture and suggests tile", async () => {
  const { d, calls } = world();
  const r = must(await generateBackground(d, caller(), { accountId: VEREIN, prompt: "Leinen, hell", tileable: true }));
  assert.equal(r.background.kind === "image" && r.background.fit, "tile");
  assert.equal(calls[0].aspectRatio, "1:1");
  assert.match(calls[0].prompt, /nahtlos/i);
});

test("sticker: square, removal applied, layer centred at 30 % of the card width with ai: true", async () => {
  let removed = 0;
  const { d, calls } = world({
    removeBackground: async (b) => {
      removed += 1;
      return b;
    },
  });
  const r = must(await generateSticker(d, caller(), { accountId: VEREIN, prompt: "Windmühle" }));
  assert.equal(removed, 1);
  assert.equal(r.notice, undefined);
  assert.equal(calls[0].aspectRatio, "1:1");
  assert.ok(calls[0].prompt.startsWith(STICKER_PROMPT_PREFIX));
  assert.equal(r.asset.kind, "sticker");
  assert.equal(r.asset.ai, true);
  const l = r.layer;
  assert.equal(l.type, "image");
  assert.equal(l.type === "image" && l.role, "sticker");
  assert.equal(l.type === "image" && l.assetId, r.asset.sha);
  assert.equal(l.ai, true);
  assert.equal(l.w, Math.round(CARD_W * 0.3));
  assert.equal(l.h, l.w);
  assert.equal(l.x, Math.round((CARD_W - l.w) / 2));
  assert.equal(l.y, Math.round((CARD_H - l.h) / 2));
});

test("sticker: background removal failing stores the image as it is, with a notice", async () => {
  const { d, store } = world({
    removeBackground: async () => {
      throw new Error("model unavailable");
    },
  });
  const r = must(await generateSticker(d, caller(), { accountId: VEREIN, prompt: "Windmühle" }));
  assert.equal(r.notice, STICKER_REMOVAL_NOTICE);
  assert.equal(STICKER_REMOVAL_NOTICE, "Hintergrund konnte nicht entfernt werden.");
  assert.ok(await store.getAsset(r.asset.sha, VEREIN));
});

test("limit: the 21st background of the Berlin day is refused with 429 AI_LIMIT", async () => {
  const { d, calls } = world();
  for (let i = 0; i < AI_DAILY_LIMITS.background; i++) must(await generateBackground(d, caller(), { accountId: VEREIN, prompt: `Textur ${i}` }));
  const r = await generateBackground(d, caller(), { accountId: VEREIN, prompt: "noch eine" });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 429);
  assert.equal((r as { code: string }).code, "AI_LIMIT");
  assert.equal((r as { message: string }).message, "Für heute sind alle KI-Bilder eurer Organisation verbraucht. Morgen geht es weiter.");
  // Over the limit nothing is generated (no paid call).
  assert.equal(calls.length, AI_DAILY_LIMITS.background);
  // Stickers have their own budget.
  must(await generateSticker(d, caller(), { accountId: VEREIN, prompt: "Sticker" }));
  assert.equal(await aiUsageToday(d.store, VEREIN, "background", NOW), 20);
  assert.equal(await aiUsageToday(d.store, VEREIN, "sticker", NOW), 1);
});

test("limit: a new Berlin day starts at local midnight", async () => {
  // 2026-11-20 23:30 UTC = 2026-11-21 00:30 in Berlin (CET, UTC+1).
  assert.equal(berlinDayStart(Date.parse("2026-11-20T23:30:00Z")), "2026-11-20T23:00:00.000Z");
  assert.equal(berlinDayStart(Date.parse("2026-11-20T10:00:00Z")), "2026-11-19T23:00:00.000Z");
  // Summer time (CEST, UTC+2).
  assert.equal(berlinDayStart(Date.parse("2026-07-01T12:00:00Z")), "2026-06-30T22:00:00.000Z");
  const { d } = world();
  for (let i = 0; i < AI_DAILY_LIMITS.background; i++) must(await generateBackground(d, caller(), { accountId: VEREIN, prompt: `Textur ${i}` }));
  const tomorrow = { ...d, now: () => NOW + 24 * 3600 * 1000 };
  must(await generateBackground(tomorrow, caller(), { accountId: VEREIN, prompt: "neuer Tag" }));
});

test("limit: two admins racing at 19 get one image and one AI_LIMIT, never a 21st", async () => {
  const gates: Array<() => void> = [];
  const { d, store } = world();
  for (let i = 0; i < AI_DAILY_LIMITS.background - 1; i++) must(await generateBackground(d, caller(), { accountId: VEREIN, prompt: `Textur ${i}` }));
  // Both requests pass the pre-check, then their images arrive one after the other.
  const slow: AiDeps = {
    ...d,
    generate: async () => {
      await new Promise<void>((res) => gates.push(res));
      return png();
    },
  };
  const a = generateBackground(slow, caller(), { accountId: VEREIN, prompt: "Admin A" });
  const b = generateBackground(slow, caller(), { accountId: VEREIN, prompt: "Admin B" });
  for (let i = 0; gates.length < 2 && i < 10_000; i++) await new Promise((r) => setImmediate(r));
  assert.equal(gates.length, 2, "both requests reach the generator");
  gates[0]();
  const ra = await a;
  gates[1]();
  const rb = await b;
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, false);
  assert.equal((rb as { code: string }).code, "AI_LIMIT");
  assert.equal((await store.assetsOf(VEREIN)).filter((x) => x.ai && x.kind === "background").length, 20);
});

test("timeout: a slow generator returns 504 AI_TIMEOUT and nothing counts", async () => {
  const { d, store } = world({ generate: () => new Promise<Uint8Array>(() => {}), budgetMs: 20 });
  const r = await generateBackground(d, caller(), { accountId: VEREIN, prompt: "Müritz" });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 504);
  assert.equal((r as { code: string }).code, "AI_TIMEOUT");
  assert.equal((r as { message: string }).message, "Das Bild braucht gerade zu lange. Bitte versuche es noch einmal.");
  assert.equal(await aiUsageToday(store, VEREIN, "background", NOW), 0);
  assert.equal((await store.assetsOf(VEREIN)).length, 0);
});

test("generator failure returns 502 AI_FAILED and nothing counts", async () => {
  const { d, store } = world({
    generate: async () => {
      throw new Error("boom");
    },
  });
  const r = await generateSticker(d, caller(), { accountId: VEREIN, prompt: "Müritz" });
  assert.equal((r as { status: number }).status, 502);
  assert.equal((r as { code: string }).code, "AI_FAILED");
  assert.equal(await aiUsageToday(store, VEREIN, "sticker", NOW), 0);
});

test("prompt must be 3 to 300 characters", async () => {
  const { d, calls } = world();
  const short = await generateBackground(d, caller(), { accountId: VEREIN, prompt: "ab" });
  assert.equal((short as { status: number }).status, 400);
  assert.equal((short as { code: string }).code, "BAD_PROMPT");
  const long = await generateSticker(d, caller(), { accountId: VEREIN, prompt: "x".repeat(301) });
  assert.equal((long as { status: number }).status, 400);
  assert.equal(calls.length, 0);
});

test("the designer switch off → 403; a member → 403; nothing generated", async () => {
  const { d, calls } = world();
  const off = await generateBackground({ ...d, settings: async () => "false" }, caller(), { accountId: VEREIN, prompt: "Müritz" });
  assert.equal((off as { status: number }).status, 403);
  assert.equal((off as { code: string }).code, "DESIGNER_OFF");
  const member = await generateSticker(d, caller(MEMBER), { accountId: VEREIN, prompt: "Müritz" });
  assert.equal((member as { status: number }).status, 403);
  assert.equal(calls.length, 0);
});

test("personal data is not forwarded: e-mail addresses and phone numbers are removed", () => {
  assert.equal(scrubPrompt("Logo für max@example.org, Tel. +49 170 1234567, blau"), "Logo für , Tel. , blau");
  assert.equal(scrubPrompt("  Müritz   blau "), "Müritz blau");
});
