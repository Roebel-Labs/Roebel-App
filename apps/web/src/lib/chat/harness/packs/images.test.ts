import { test } from "node:test";
import assert from "node:assert/strict";
import { isToolInputError } from "../errors";
import type { HarnessContext } from "../types";
import type { ChatPart } from "../../types";
import {
  IMAGE_DAILY_LIMITS, ImageGenError, NOMINAL_SIZE, aspectFor, buildImagePrompt, generateImage, germanReason,
  imageCapMessage, imageCapState, imageObjectPath, imagesDeps, parseStorageUrl, publishImagePart,
  threadImageUrls, validateSourceImage,
} from "./images";

const SB = "https://abcd.supabase.co";
const WALLET = "0x" + "11".repeat(20);
const OTHER = "0x" + "22".repeat(20);
const THREAD = "7d3c1a6e-1111-4c3a-9e8f-0a1b2c3d4e5f";
const upload = (w = WALLET, name = "a.jpg") => `${SB}/storage/v1/object/sign/chat-media/${w}/${name}?token=abc`;
const generated = (t = THREAD, name = "g.png") => `${SB}/storage/v1/object/public/images/chat/agents/${t}/${name}`;

const inputError = (re: RegExp) => (err: unknown) => {
  assert.ok(isToolInputError(err), String(err));
  assert.match((err as Error).message, re);
  return true;
};

// ---- prompt builder -----------------------------------------------------------------

test("buildImagePrompt: food uses the isolated, sharp, flat-background style and no text", () => {
  const p = buildImagePrompt({ prompt: "Zanderfilet mit Bratkartoffeln", style: "food" });
  assert.match(p, /Motif: Zanderfilet mit Bratkartoffeln/);
  assert.match(p, /Uber-Eats/);
  assert.match(p, /flat neutral background/);
  assert.match(p, /perfect sharp focus/);
  assert.match(p, /no text/i);
  assert.doesNotMatch(p, /Röbel on the Müritz/);
});

test("buildImagePrompt: poster with text typesets exactly that German title", () => {
  const p = buildImagePrompt({ prompt: "Herbstfest mit Laternen", style: "poster", text: "Herbstfest 2026" });
  assert.match(p, /event poster/);
  assert.match(p, /EXACTLY this German text[^\n]*"Herbstfest 2026"/);
  assert.doesNotMatch(p, /Absolutely no text/);
});

test("buildImagePrompt: text is ignored for photo styles; Röbel vibe only when relevant", () => {
  const photo = buildImagePrompt({ prompt: "Sonnenuntergang an der Müritz", style: "photo", text: "Hallo" });
  assert.match(photo, /Absolutely no text/);
  assert.doesNotMatch(photo, /Hallo/);
  assert.match(photo, /Röbel on the Müritz/);
  const plain = buildImagePrompt({ prompt: "Eine Katze auf dem Sofa" });
  assert.doesNotMatch(plain, /Röbel on the Müritz/);
  assert.match(plain, /Photorealistic/);
});

test("buildImagePrompt: a source image turns it into an edit instruction", () => {
  const p = buildImagePrompt({ prompt: "Hintergrund weiß machen", style: "food", hasSource: true });
  assert.match(p, /^Edit the provided reference image\. Requested change: Hintergrund weiß machen/);
  assert.doesNotMatch(p, /^Motif:/m);
});

test("aspectFor: explicit aspect wins, otherwise the style default", () => {
  assert.equal(aspectFor("food", undefined), "16:9");
  assert.equal(aspectFor("poster", undefined), "4:5");
  assert.equal(aspectFor(undefined, undefined), "4:5");
  assert.equal(aspectFor("food", "1:1"), "1:1");
  assert.deepEqual(NOMINAL_SIZE["16:9"], { width: 1344, height: 768 });
});

// ---- cap -------------------------------------------------------------------------------

test("imageCapState follows the tier limits (5 / 30 / 100)", () => {
  assert.deepEqual(IMAGE_DAILY_LIMITS, { free: 5, plus: 30, ultra: 100 });
  assert.deepEqual(imageCapState(4, "free"), { limit: 5, remaining: 1, exceeded: false });
  assert.deepEqual(imageCapState(5, "free"), { limit: 5, remaining: 0, exceeded: true });
  assert.equal(imageCapState(29, "plus").exceeded, false);
  assert.equal(imageCapState(30, "plus").exceeded, true);
  assert.equal(imageCapState(99, "ultra").remaining, 1);
  assert.match(imageCapMessage("free", 5), /5 pro Tag.*Ultra/);
  assert.doesNotMatch(imageCapMessage("ultra", 100), /Mit Ultra/);
});

// ---- source validation ---------------------------------------------------------------------

test("parseStorageUrl: only our host, https, object/public|sign paths, no traversal", () => {
  assert.deepEqual(parseStorageUrl(upload(), SB), { access: "sign", bucket: "chat-media", path: `${WALLET}/a.jpg` });
  assert.deepEqual(parseStorageUrl(generated(), SB), { access: "public", bucket: "images", path: `chat/agents/${THREAD}/g.png` });
  for (const bad of [
    "https://evil.example/storage/v1/object/public/images/x.png",
    "https://other.supabase.co/storage/v1/object/public/images/x.png",
    `http://abcd.supabase.co/storage/v1/object/public/images/x.png`,
    `${SB}/storage/v1/render/image/public/images/x.png`,
    `${SB}/storage/v1/object/public/images/chat/%2e%2e/secret.png`,
    `${SB}/storage/v1/object/public/images/a//b.png`,
    `https://u:p@abcd.supabase.co/storage/v1/object/public/images/x.png`,
    "not a url",
  ]) assert.equal(parseStorageUrl(bad, SB), null, bad);
});

test("threadImageUrls: human photos + finished generated images only", () => {
  const parts: ChatPart[] = [
    { type: "image", url: upload() },
    { type: "text", text: "hi" },
    { type: "generated_image", imageId: "a", status: "done", prompt: "x", url: generated() },
    { type: "generated_image", imageId: "b", status: "failed", prompt: "y", error: "nope" },
    { type: "generated_image", imageId: "c", status: "generating", prompt: "z" },
  ];
  assert.deepEqual(threadImageUrls(parts), [upload(), generated()]);
});

test("validateSourceImage accepts the human's upload in this thread (any token) and our generated image", () => {
  const threadUrls = [upload(), generated()];
  const opts = { supabaseUrl: SB, wallet: WALLET, threadId: THREAD, threadUrls };
  // A re-signed URL (different token) of the same object still matches.
  assert.equal(validateSourceImage(upload().replace("token=abc", "token=zzz"), opts).path, `${WALLET}/a.jpg`);
  assert.equal(validateSourceImage(generated(), opts).bucket, "images");
});

test("validateSourceImage rejects foreign hosts, other wallets/threads and images not in the thread", () => {
  const deny = inputError(/in diesem Chat/);
  const opts = { supabaseUrl: SB, wallet: WALLET, threadId: THREAD, threadUrls: [upload(), upload(OTHER), generated("other-thread")] };
  assert.throws(() => validateSourceImage("https://example.com/cat.png", opts), deny);
  assert.throws(() => validateSourceImage(upload(OTHER), opts), deny); // someone else's upload
  assert.throws(() => validateSourceImage(generated("other-thread"), opts), deny); // generated elsewhere
  assert.throws(() => validateSourceImage(upload(WALLET, "never-sent.jpg"), opts), deny); // not in thread
  assert.throws(() => validateSourceImage(`${SB}/storage/v1/object/public/images/posts/x.png`, opts), deny); // other prefix
});

test("imageObjectPath lives under chat/agents/<threadId> with the right extension", () => {
  assert.equal(imageObjectPath(THREAD, "image/png", "id"), `chat/agents/${THREAD}/id.png`);
  assert.equal(imageObjectPath(THREAD, "image/jpeg", "id"), `chat/agents/${THREAD}/id.jpg`);
  assert.equal(imageObjectPath(THREAD, "image/webp", "id"), `chat/agents/${THREAD}/id.webp`);
});

test("germanReason passes ImageGenError messages, hides everything else", () => {
  assert.equal(germanReason(new ImageGenError("Die Bildgenerierung hat zu lange gedauert.")), "Die Bildgenerierung hat zu lange gedauert.");
  assert.equal(germanReason(new Error("ECONNRESET 10.0.0.1")), "Das Bild konnte gerade nicht erstellt werden.");
});

// ---- tool flow (stubbed seams) ------------------------------------------------------------

function ctxWith(updates: ChatPart[], opts: { live?: boolean } = {}): HarnessContext {
  const emitted: ChatPart[] = [];
  return {
    tenant: { id: "roebel", name: "Röbel/Müritz", region: "", timezone: "Europe/Berlin", locale: "de", appOrigin: "https://www.roebel.app", facts: [] },
    wallet: WALLET, threadId: THREAD, botId: "b", taskId: null, profile: null,
    emitPart: (p) => { emitted.push(p); },
    turn: { emitted, ...(opts.live ? { updatePart: (p: ChatPart) => { updates.push(p); } } : {}) },
  };
}

function stub(over: Partial<typeof imagesDeps> = {}) {
  const saved = { ...imagesDeps };
  const runs: boolean[] = [];
  Object.assign(imagesDeps, {
    supabaseUrl: () => SB,
    tier: async () => "free",
    imagesToday: async () => 0,
    recordRun: async (_ctx: HarnessContext, ok: boolean) => { runs.push(ok); },
    threadUrls: async () => [upload()],
    fetchableUrl: async () => "https://signed.example/fresh",
    generate: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" }),
    store: async () => ({ url: generated(THREAD, "new.png"), width: 1024, height: 1280 }),
    ...over,
  });
  return { runs, restore: () => Object.assign(imagesDeps, saved) };
}

test("generate_image streams generating → done and returns the permanent URL", async () => {
  const s = stub();
  try {
    const updates: ChatPart[] = [];
    const out = (await generateImage.execute({ prompt: "Laternenumzug in Röbel", style: "poster", text: "Laternenfest" }, ctxWith(updates, { live: true }))) as Record<string, unknown>;
    assert.equal(out.ok, true);
    assert.equal(out.imageUrl, generated(THREAD, "new.png"));
    assert.equal(updates.length, 2);
    const [first, last] = updates as Extract<ChatPart, { type: "generated_image" }>[];
    assert.equal(first.status, "generating");
    assert.deepEqual([first.width, first.height], [896, 1120]); // poster → 4:5 placeholder
    assert.equal(last.status, "done");
    assert.equal(last.imageId, first.imageId);
    assert.equal(last.url, generated(THREAD, "new.png"));
    assert.deepEqual([last.width, last.height], [1024, 1280]);
    assert.deepEqual(s.runs, [true]);
  } finally { s.restore(); }
});

test("generate_image without a live channel replaces the emitted part in place", async () => {
  const s = stub();
  try {
    const ctx = ctxWith([]);
    await generateImage.execute({ prompt: "Ein Boot auf dem See" }, ctx);
    const emitted = ctx.turn!.emitted!;
    assert.equal(emitted.length, 1);
    assert.equal((emitted[0] as { status: string }).status, "done");
  } finally { s.restore(); }
});

test("generate_image: failure marks the card failed with a German reason and records an error run", async () => {
  const s = stub({ generate: async () => { throw new ImageGenError("Die Bildgenerierung hat zu lange gedauert. Bitte erneut versuchen."); } });
  try {
    const updates: ChatPart[] = [];
    const out = (await generateImage.execute({ prompt: "Ein Drache" }, ctxWith(updates, { live: true }))) as { error: string };
    assert.match(out.error, /zu lange gedauert/);
    const last = updates[updates.length - 1] as Extract<ChatPart, { type: "generated_image" }>;
    assert.equal(last.status, "failed");
    assert.match(last.error ?? "", /zu lange gedauert/);
    assert.equal(last.url, undefined);
    assert.deepEqual(s.runs, [false]);
  } finally { s.restore(); }
});

test("generate_image: daily cap blocks before any card is shown", async () => {
  const s = stub({ imagesToday: async () => 5 });
  try {
    const updates: ChatPart[] = [];
    await assert.rejects(generateImage.execute({ prompt: "Noch ein Bild" }, ctxWith(updates, { live: true })), inputError(/Tageslimit/));
    assert.equal(updates.length, 0);
  } finally { s.restore(); }
});

test("generate_image: a foreign source URL is rejected before kie.ai is called", async () => {
  let called = false;
  const s = stub({ generate: async () => { called = true; return { bytes: new Uint8Array(), contentType: "image/png" }; } });
  try {
    await assert.rejects(
      generateImage.execute({ prompt: "Mach es bunter", sourceImageUrl: "https://example.com/x.png" }, ctxWith([], { live: true })),
      inputError(/in diesem Chat/),
    );
    assert.equal(called, false);
  } finally { s.restore(); }
});

test("generate_image: a thread upload is passed to kie.ai as a fresh signed URL", async () => {
  let refs: string[] = [];
  const s = stub({ generate: async (_p: string, urls: string[]) => { refs = urls; return { bytes: new Uint8Array([1]), contentType: "image/png" }; } });
  try {
    await generateImage.execute({ prompt: "Hintergrund entfernen", style: "food", sourceImageUrl: upload() }, ctxWith([], { live: true }));
    assert.deepEqual(refs, ["https://signed.example/fresh"]);
  } finally { s.restore(); }
});

test("publishImagePart prefers the live channel", () => {
  const updates: ChatPart[] = [];
  const ctx = ctxWith(updates, { live: true });
  publishImagePart(ctx, { type: "generated_image", imageId: "x", status: "generating", prompt: "p" });
  assert.equal(updates.length, 1);
  assert.equal(ctx.turn!.emitted!.length, 0);
});
