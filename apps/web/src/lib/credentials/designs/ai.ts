// AI help for the card designer (plan D5): "Hintergrund erzeugen" and "Sticker erzeugen".
// A short description goes to the kie.ai image pipeline behind a fixed style instruction; the
// result is marked as synthetic (AI Act Art. 50(2)) inside the file and stored as an org asset
// with `ai: true` and the prompt. Limits per org and Berlin day, checked before the paid call and
// again atomically with the insert.
//
// Generation and background removal are injected (`AiDeps`), so tests run without kie.ai; the
// production adapters live in ai-runtime.ts.
// Relative imports only: loaded by `npx tsx --test`.
import sharp from "sharp";
import { CARD_H, CARD_W, type Background, type ImageLayer, type Layer } from "@roebel/card-design";
import type { Caller } from "../caller";
import { markSyntheticImage } from "../../images/ai-marking";
import { storeAsset, type AssetDeps, type AssetView } from "./assets";
import { designOrgFor, fail, isFail, ok, type DesignResult } from "./drafts";
import type { DesignStore } from "./store";

export type AiKind = "background" | "sticker";

/** Generated images per org and Berlin day. */
export const AI_DAILY_LIMITS: Readonly<Record<AiKind, number>> = { background: 20, sticker: 20 };
/** Whole budget of one generation (kie.ai job + download). */
export const AI_TIMEOUT_MS = 60_000;
export const PROMPT_MIN = 3;
export const PROMPT_MAX = 300;

export const BACKGROUND_PROMPT_PREFIX = "Kartenhintergrund, ruhige Fläche ohne Text, hochwertige Textur:";
export const TILEABLE_SUFFIX = "Nahtlos kachelbares Muster, Ränder passen ohne Kante aneinander.";
export const STICKER_PROMPT_PREFIX = "Einzelnes Sticker-Motiv, flach, freigestellt, ohne Text:";
export const STICKER_REMOVAL_NOTICE = "Hintergrund konnte nicht entfernt werden.";

/**
 * kie.ai background-removal model for stickers, resolved with `resolveKieModel` in ai-runtime.ts.
 * null: no removal model is wired yet (none is documented in this repo), so stickers are stored
 * as generated, with STICKER_REMOVAL_NOTICE. Set the kie.ai model id here to switch removal on.
 */
export const BACKGROUND_REMOVAL_MODEL: string | null = null;

/** Sticker width as a share of the card width. */
export const STICKER_WIDTH_SHARE = 0.3;

export type AiAspectRatio = "16:9" | "1:1";
export type AiGenerateInput = { prompt: string; aspectRatio: AiAspectRatio; feature: string };

export type AiDeps = AssetDeps & {
  /** Generates one image and returns its bytes (PNG or JPEG). */
  generate: (input: AiGenerateInput) => Promise<Uint8Array>;
  /** Returns the image with a transparent background; throws when that is not possible. */
  removeBackground: (png: Uint8Array) => Promise<Uint8Array>;
  /** Overrides AI_TIMEOUT_MS (tests). */
  budgetMs?: number;
  /** Lands in the file's xmp:CreatorTool. */
  generatorName?: string;
};

/** Thrown by a generator whose provider gave up for time (mapped to AI_TIMEOUT). */
export class AiTimeoutError extends Error {}
/** A generator failure whose message may be shown (German). */
export class AiGenerationError extends Error {}

export const AI_LIMIT = fail(429, "AI_LIMIT", "Für heute sind alle KI-Bilder eurer Organisation verbraucht. Morgen geht es weiter.");
export const AI_TIMEOUT = fail(504, "AI_TIMEOUT", "Das Bild braucht gerade zu lange. Bitte versuche es noch einmal.");
const AI_FAILED_TEXT = "Das Bild konnte gerade nicht erzeugt werden. Bitte versuche es noch einmal.";
const BAD_PROMPT = fail(400, "BAD_PROMPT", `Bitte beschreibe das Bild mit ${PROMPT_MIN} bis ${PROMPT_MAX} Zeichen.`);

// ── helpers ───────────────────────────────────────────────────────────────────

const BERLIN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function berlinParts(t: number): { date: string; time: string } {
  const p = Object.fromEntries(BERLIN.formatToParts(t).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Start of the Berlin calendar day containing `now`, as an ISO instant. */
export function berlinDayStart(now: number): string {
  const { date } = berlinParts(now);
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  // Berlin is UTC+1 (CET) or UTC+2 (CEST); the right offset maps back to 00:00 on that date.
  for (const offsetH of [1, 2]) {
    const t = midnightUtc - offsetH * 3600_000;
    const back = berlinParts(t);
    if (back.date === date && back.time === "00:00") return new Date(t).toISOString();
  }
  return new Date(midnightUtc - 3600_000).toISOString();
}

export async function aiUsageToday(store: DesignStore, accountId: string, kind: AiKind, now: number): Promise<number> {
  return store.countAiAssetsSince(accountId, kind, berlinDayStart(now));
}

/** The description without e-mail addresses and phone numbers, whitespace collapsed. */
export function scrubPrompt(prompt: string): string {
  return prompt
    .replace(/[^\s@]+@[^\s@]+\.[^\s@,;]+/g, "")
    .replace(/\+?\d[\d\s/().-]{6,}\d/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function checkPrompt(prompt: unknown): string | null {
  if (typeof prompt !== "string") return null;
  const t = prompt.trim();
  return t.length >= PROMPT_MIN && t.length <= PROMPT_MAX ? t : null;
}

async function withBudget<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiTimeoutError("budget")), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Generated = { bytes: Uint8Array; mime: string };

/** Access, prompt, limit pre-check and the generation itself. */
async function run(
  d: AiDeps,
  c: Caller,
  p: { accountId: string; prompt: string },
  kind: AiKind,
  build: (prompt: string) => AiGenerateInput,
): Promise<DesignResult<{ accountId: string; prompt: string; raw: Uint8Array }>> {
  const org = await designOrgFor(d, c, p?.accountId);
  if (isFail(org)) return org;
  const prompt = checkPrompt(p?.prompt);
  if (prompt === null) return BAD_PROMPT;
  const forwarded = scrubPrompt(prompt);
  if (forwarded.length < PROMPT_MIN) return BAD_PROMPT;
  if ((await aiUsageToday(d.store, org.accountId, kind, d.now())) >= AI_DAILY_LIMITS[kind]) return AI_LIMIT;
  try {
    const raw = await withBudget(d.generate(build(forwarded)), d.budgetMs ?? AI_TIMEOUT_MS);
    if (!(raw instanceof Uint8Array) || raw.byteLength === 0) throw new Error("empty image");
    return ok({ accountId: org.accountId, prompt, raw });
  } catch (err) {
    if (err instanceof AiTimeoutError) return AI_TIMEOUT;
    console.error("[credentials/designs/ai]", kind, err instanceof Error ? err.message : err);
    return fail(502, "AI_FAILED", err instanceof AiGenerationError ? err.message : AI_FAILED_TEXT);
  }
}

async function store(d: AiDeps, c: Caller, accountId: string, kind: AiKind, prompt: string, img: Generated) {
  const generator = d.generatorName ?? "Röbel App / kie.ai";
  return storeAsset(
    d,
    c,
    { accountId, kind, bytes: img.bytes, mime: img.mime, ai: true, prompt },
    {
      mark: (bytes) => markSyntheticImage(bytes, generator).bytes,
      // The file may already sit in storage when this refuses: content-addressed, never referenced.
      insert: async (row) => ((await d.store.insertAiAssetWithinLimit(row, berlinDayStart(d.now()), AI_DAILY_LIMITS[kind])) ? null : AI_LIMIT),
    },
  );
}

// ── actions ───────────────────────────────────────────────────────────────────

/** design_ai_background: a card background, suggested as `cover` (cropped centrally) or `tile`. */
export async function generateBackground(
  d: AiDeps,
  c: Caller,
  p: { accountId: string; prompt: string; tileable?: boolean },
): Promise<DesignResult<{ asset: AssetView; background: Background }>> {
  const tileable = p?.tileable === true;
  const g = await run(d, c, p, "background", (prompt) => ({
    // 16:9 is the supported ratio closest to the card's 924:580; a tile is square.
    aspectRatio: tileable ? "1:1" : "16:9",
    prompt: [BACKGROUND_PROMPT_PREFIX, prompt, tileable ? TILEABLE_SUFFIX : ""].filter(Boolean).join(" "),
    feature: "credentials.design_background",
  }));
  if (isFail(g)) return g;
  let jpeg: Uint8Array;
  try {
    jpeg = new Uint8Array(await sharp(g.data.raw, { limitInputPixels: 64_000_000 }).jpeg({ quality: 90 }).toBuffer());
  } catch {
    return fail(502, "AI_FAILED", AI_FAILED_TEXT);
  }
  const a = await store(d, c, g.data.accountId, "background", g.data.prompt, { bytes: jpeg, mime: "image/jpeg" });
  if (isFail(a)) return a;
  return ok({ asset: a.data, background: { kind: "image", assetId: a.data.sha, fit: tileable ? "tile" : "cover" } });
}

/** design_ai_sticker: a square motif with its background removed, as a layer suggestion. */
export async function generateSticker(
  d: AiDeps,
  c: Caller,
  p: { accountId: string; prompt: string },
): Promise<DesignResult<{ asset: AssetView; layer: Layer; notice?: string }>> {
  const g = await run(d, c, p, "sticker", (prompt) => ({
    aspectRatio: "1:1",
    prompt: `${STICKER_PROMPT_PREFIX} ${prompt}`,
    feature: "credentials.design_sticker",
  }));
  if (isFail(g)) return g;
  let pngBytes: Uint8Array;
  try {
    pngBytes = new Uint8Array(await sharp(g.data.raw, { limitInputPixels: 64_000_000 }).png().toBuffer());
  } catch {
    return fail(502, "AI_FAILED", AI_FAILED_TEXT);
  }
  let notice: string | undefined;
  try {
    pngBytes = await withBudget(d.removeBackground(pngBytes), d.budgetMs ?? AI_TIMEOUT_MS);
  } catch (err) {
    console.warn("[credentials/designs/ai] background removal:", err instanceof Error ? err.message : err);
    notice = STICKER_REMOVAL_NOTICE;
  }
  const a = await store(d, c, g.data.accountId, "sticker", g.data.prompt, { bytes: pngBytes, mime: "image/png" });
  if (isFail(a)) return a;
  const w = Math.round(CARD_W * STICKER_WIDTH_SHARE);
  const aspect = a.data.width && a.data.height ? a.data.height / a.data.width : 1;
  const h = Math.round(w * aspect);
  const layer: ImageLayer = {
    id: "ai-sticker",
    type: "image",
    role: "sticker",
    assetId: a.data.sha,
    x: Math.round((CARD_W - w) / 2),
    y: Math.round((CARD_H - h) / 2),
    w,
    h,
    rotation: 0,
    opacity: 1,
    shine: false,
    ai: true,
  };
  return ok(notice ? { asset: a.data, layer, notice } : { asset: a.data, layer });
}
