// Pack 'images': AI image generation in the chat (kie.ai, default Nano Banana 2 Lite via
// lib/images/kie.ts — the single image path of apps/web). Text-to-image, or image-to-image
// from a picture the human sent in THIS thread (or one we generated here).
//
// Flow: emit a generated_image part in state 'generating' (streamed at once) → kie task
// (≤ 90 s) → AI-Act-marked bytes stored PERMANENTLY in the public `images` bucket under
// chat/agents/<threadId>/ (same bucket + public-URL convention as the flyer feature, so
// feed posts / events / listings can use the URL directly) → part updated to done|failed.
//
// Risk 'private': nothing leaves the chat until a public tool (create_feed_post, …) is approved.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ToolInputError } from "../errors";
import { livePartKey } from "../parts";
import type { GeneratedImagePart } from "../parts";
import type { ChatPart, ChatTier } from "../../types";
import type { HarnessContext, HarnessTool, ToolRegistry } from "../types";

// ---- constants -----------------------------------------------------------------------

export const IMAGE_ASPECTS = ["1:1", "4:5", "16:9", "9:16"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];
export const IMAGE_STYLES = ["poster", "photo", "food", "illustration", "social"] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

/** Images per Berlin day (tier conventions of quota.ts). */
export const IMAGE_DAILY_LIMITS: Record<ChatTier, number> = { free: 5, plus: 30, ultra: 100 };

/** Rough kie.ai price of one Nano Banana 2 Lite image (≈ 0,02 $), recorded in chat_runs.cost_micros. */
export const IMAGE_COST_MICROS = 20_000;
export const IMAGE_RUN_ROUTE = "image";
export const IMAGE_BUDGET_MS = 90_000;

export const IMAGE_BUCKET = "images";
export const IMAGE_PREFIX = "chat/agents";
const CHAT_MEDIA_BUCKET = "chat-media";
/** Lifetime of the fresh signed URL we hand kie.ai for a chat-media source image. */
const SOURCE_SIGNED_SECONDS = 15 * 60;

const DEFAULT_ASPECT: Record<ImageStyle, ImageAspect> = {
  poster: "4:5", photo: "4:5", food: "16:9", illustration: "1:1", social: "1:1",
};

/** Nominal output size per aspect (placeholder ratio while generating; real size replaces it). */
export const NOMINAL_SIZE: Record<ImageAspect, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 896, height: 1120 },
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
};

// ---- prompt builder (pure) -------------------------------------------------------------

const NO_TEXT = "Absolutely no text, letters, numbers, captions, logos or watermarks anywhere in the image.";

const STYLE_SUFFIX: Record<ImageStyle, string> = {
  photo:
    "Photorealistic photograph, natural light, realistic colours, sharp focus on the subject, " +
    "authentic and unposed, no over-processed HDR look.",
  food:
    "Studio-grade product food photography in Uber-Eats catalog style: the dish isolated and perfectly centered " +
    "on a clean flat neutral background, even margins, entire image in perfect sharp focus (no depth-of-field blur, " +
    "no bokeh), bright even soft lighting, vibrant natural colours, ultra clean composition. " +
    "No people, no hands, no cutlery, no packaging branding.",
  poster:
    "Clean, modern event poster: strong simple composition, one clear focal motif, generous whitespace, " +
    "flat harmonious colour palette, print-quality and trustworthy, not abstract AI art.",
  illustration:
    "Friendly flat vector illustration, clean shapes, limited harmonious palette, soft subtle shading, " +
    "consistent line weight, uncluttered background.",
  social:
    "Eye-catching square social-media visual: bold simple composition that reads at thumbnail size, " +
    "one clear subject, vivid but tasteful colours, clean background.",
};

const LOCAL_RE = /r(ö|oe)bel|m(ü|ue)ritz|mecklenburg|seenplatte/i;
const LOCAL_VIBE =
  "Setting: the small historic town of Röbel on the Müritz lake in Mecklenburg, Germany — lakeside, " +
  "red-brick Gothic church towers, half-timbered houses, calm northern German light.";

/**
 * Turns the model's motif description into the kie.ai prompt: motif, style
 * suffix, text rules (exact German text for posters/social when `text` is set,
 * otherwise no text at all), the Röbel/Müritz setting only when the motif
 * mentions it, and edit rules when a source image is passed.
 */
export function buildImagePrompt(input: {
  prompt: string; style?: ImageStyle | null; text?: string | null; hasSource?: boolean;
}): string {
  const style = input.style ?? "photo";
  const motif = input.prompt.trim().replace(/\s+/g, " ");
  const text = input.text?.trim().replace(/\s+/g, " ") ?? "";
  const lines: string[] = [];
  if (input.hasSource) {
    lines.push(`Edit the provided reference image. Requested change: ${motif}`);
    lines.push(
      "Keep the subject, its identity and proportions recognisable; change only what is asked. " +
      "Do not add people or objects that were not requested.",
    );
  } else {
    lines.push(`Motif: ${motif}`);
  }
  lines.push(`Style: ${STYLE_SUFFIX[style]}`);
  if (LOCAL_RE.test(motif) || LOCAL_RE.test(text)) lines.push(LOCAL_VIBE);
  if (text && (style === "poster" || style === "social")) {
    lines.push(
      `Typeset EXACTLY this German text as a large, bold, highly legible headline: "${text}". ` +
      "Do not translate, do not add any other text, spell every character (including ä, ö, ü, ß) correctly, " +
      "never crop, warp or cover the text; keep comfortable margins.",
    );
  } else {
    lines.push(NO_TEXT);
  }
  return lines.join("\n");
}

export function aspectFor(style: ImageStyle | undefined, aspect: ImageAspect | undefined): ImageAspect {
  return aspect ?? DEFAULT_ASPECT[style ?? "photo"];
}

// ---- daily cap (pure) --------------------------------------------------------------------

export function imageCapState(used: number, tier: ChatTier): { limit: number; remaining: number; exceeded: boolean } {
  const limit = IMAGE_DAILY_LIMITS[tier] ?? IMAGE_DAILY_LIMITS.free;
  const remaining = Math.max(0, limit - used);
  return { limit, remaining, exceeded: used >= limit };
}

export function imageCapMessage(tier: ChatTier, limit: number): string {
  const upsell = tier === "ultra" ? "" : " Mit Ultra sind bis zu 100 Bilder am Tag möglich.";
  return `Das Tageslimit für Bilder ist erreicht (${limit} pro Tag). Morgen geht es wieder.${upsell}`;
}

// ---- source image validation (pure) ------------------------------------------------------

export interface StorageRef { access: "public" | "sign"; bucket: string; path: string }

/**
 * Parses a Supabase storage object URL of OUR project (exact host, https).
 * Returns null for anything else — we never hand arbitrary URLs to kie.ai.
 */
export function parseStorageUrl(url: string, supabaseUrl: string): StorageRef | null {
  // Dot segments (plain or encoded) are normalised away by URL — reject them up front.
  if (/\.\.|%2e/i.test(url.split("?")[0])) return null;
  let u: URL;
  let base: URL;
  try { u = new URL(url); base = new URL(supabaseUrl); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (u.hostname.toLowerCase() !== base.hostname.toLowerCase()) return null;
  const m = /^\/storage\/v1\/object\/(public|sign)\/([a-z0-9_-]+)\/(.+)$/i.exec(u.pathname);
  if (!m) return null;
  let path: string;
  try { path = decodeURIComponent(m[3]); } catch { return null; }
  if (path.split("/").some((seg) => !seg || seg === "." || seg === "..")) return null;
  return { access: m[1].toLowerCase() as StorageRef["access"], bucket: m[2], path };
}

const refKey = (r: StorageRef) => `${r.bucket}/${r.path}`;

/** Image URLs that belong to a thread: human photos + images generated there. */
export function threadImageUrls(parts: ChatPart[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (p.type === "image" && p.url) out.push(p.url);
    else if (p.type === "generated_image" && p.status === "done" && p.url) out.push(p.url);
  }
  return out;
}

/**
 * sourceImageUrl must be (a) our storage, (b) the human's own chat upload
 * (chat-media/<wallet>/…) or an image generated in this thread
 * (images/chat/agents/<threadId>/…), and (c) actually present in this thread.
 */
export function validateSourceImage(
  url: string,
  opts: { supabaseUrl: string; wallet: string; threadId: string; threadUrls: string[] },
): StorageRef {
  const deny = () => new ToolInputError(
    "Ich kann nur Bilder als Vorlage nehmen, die in diesem Chat geschickt oder hier erzeugt wurden.",
  );
  const ref = parseStorageUrl(url, opts.supabaseUrl);
  if (!ref) throw deny();
  const ownUpload = ref.bucket === CHAT_MEDIA_BUCKET && ref.path.startsWith(`${opts.wallet.toLowerCase()}/`);
  const generatedHere = ref.bucket === IMAGE_BUCKET && ref.access === "public"
    && ref.path.startsWith(`${IMAGE_PREFIX}/${opts.threadId}/`);
  if (!ownUpload && !generatedHere) throw deny();
  const inThread = opts.threadUrls.some((u) => {
    const r = parseStorageUrl(u, opts.supabaseUrl);
    return Boolean(r && refKey(r) === refKey(ref));
  });
  if (!inThread) throw deny();
  return ref;
}

export function imageObjectPath(threadId: string, contentType: string, id: string = randomUUID()): string {
  const ct = contentType.toLowerCase();
  const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
  return `${IMAGE_PREFIX}/${threadId}/${id}.${ext}`;
}

// ---- I/O seams (stubbed in tests) --------------------------------------------------------

async function adminDb() {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

export const imagesDeps = {
  supabaseUrl(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  },
  async tier(wallet: string): Promise<ChatTier> {
    const store = await import("../../store");
    return store.getTier(wallet);
  },
  /** Successful image runs today (Berlin day). */
  async imagesToday(wallet: string): Promise<number> {
    const { quotaWindowStart } = await import("../../quota");
    const res = await (await adminDb()).from("chat_runs").select("id", { count: "exact", head: true })
      .eq("owner_wallet", wallet).eq("route", IMAGE_RUN_ROUTE).eq("status", "ok")
      .gte("created_at", quotaWindowStart());
    if (res.error) throw new Error(`[images] count: ${res.error.message}`);
    return res.count ?? 0;
  },
  async recordRun(ctx: HarnessContext, ok: boolean, error?: string): Promise<void> {
    const store = await import("../../store");
    await store.recordRun({
      wallet: ctx.wallet, threadId: ctx.threadId, botId: ctx.botId, route: IMAGE_RUN_ROUTE,
      inputTokens: 0, outputTokens: 0, costMicros: ok ? IMAGE_COST_MICROS : 0,
      status: ok ? "ok" : "error", error: error ?? null,
    });
  },
  async threadUrls(threadId: string): Promise<string[]> {
    const store = await import("../../store");
    const rows = await store.recentMessageRows(threadId, 100);
    return threadImageUrls(rows.flatMap((r) => store.partsOf(r.parts)));
  },
  /** URL kie.ai may fetch for a validated source (fresh signed URL for private chat uploads). */
  async fetchableUrl(ref: StorageRef, original: string): Promise<string> {
    if (ref.access === "public") return original;
    const res = await (await adminDb()).storage.from(ref.bucket).createSignedUrl(ref.path, SOURCE_SIGNED_SECONDS);
    if (res.error || !res.data) throw new Error(`[images] sign source: ${res.error?.message ?? "no url"}`);
    return res.data.signedUrl;
  },
  /** kie.ai job → AI-Act-marked bytes. */
  async generate(prompt: string, imageUrls: string[], aspectRatio: ImageAspect): Promise<{ bytes: Uint8Array; contentType: string }> {
    const { generateKieImage, fetchGeneratedImage, KieImageError } = await import("../../../images/kie");
    try {
      const url = await generateKieImage({ prompt, imageUrls, aspectRatio, budgetMs: IMAGE_BUDGET_MS });
      return await fetchGeneratedImage(url);
    } catch (err) {
      // KieImageError messages are German and user-safe (kie.ts logs the vendor detail).
      if (err instanceof KieImageError) throw new ImageGenError(err.message);
      throw err;
    }
  },
  async store(threadId: string, image: { bytes: Uint8Array; contentType: string }): Promise<{ url: string; width?: number; height?: number }> {
    const path = imageObjectPath(threadId, image.contentType);
    const buf = Buffer.from(image.bytes);
    const db = await adminDb();
    // 1-year cacheControl = "already processed" marker: the weekly reencode cron must not
    // re-encode (and thereby strip the AI-Act XMP marking from) these files.
    const up = await db.storage.from(IMAGE_BUCKET).upload(path, buf, {
      contentType: image.contentType, upsert: false, cacheControl: "31536000",
    });
    if (up.error) throw new Error(`[images] upload: ${up.error.message}`);
    const { data } = db.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    let width: number | undefined;
    let height: number | undefined;
    try {
      const { imageSize } = await import("image-size");
      const dims = imageSize(buf);
      width = dims.width;
      height = dims.height;
    } catch { /* dimensions are optional */ }
    return { url: data.publicUrl, width, height };
  },
};

// ---- live part helper ------------------------------------------------------------------

/** Shows / updates the image card: live in a streamed turn, else replaced in the emitted list. */
export function publishImagePart(ctx: HarnessContext, part: GeneratedImagePart): void {
  if (ctx.turn?.updatePart) {
    ctx.turn.updatePart(part);
    return;
  }
  const emitted = ctx.turn?.emitted;
  const key = livePartKey(part);
  const idx = emitted ? emitted.findIndex((p) => livePartKey(p) === key) : -1;
  if (emitted && idx >= 0) emitted[idx] = part;
  else ctx.emitPart(part);
}

// ---- generate_image ------------------------------------------------------------------------

const imageInput = z.object({
  prompt: z.string().min(3).max(1500)
    .describe("Was auf dem Bild zu sehen sein soll (Motiv, Stimmung, Details). Bei einer Vorlage: was verändert werden soll."),
  aspect: z.enum(IMAGE_ASPECTS).optional()
    .describe("Seitenverhältnis: 1:1 (quadratisch), 4:5 (Hochformat, Feed), 16:9 (Querformat), 9:16 (Story). Standard je nach Stil."),
  sourceImageUrl: z.string().url().max(2000).optional()
    .describe("Optional: Bild-URL eines Bildes, das der Mensch in DIESEM Chat geschickt hat oder das du hier erzeugt hast (Bild bearbeiten)."),
  style: z.enum(IMAGE_STYLES).optional()
    .describe("poster = Veranstaltungsplakat, photo = Foto, food = Speisenfoto (freigestellt, Uber-Eats-Stil), illustration, social = Social-Media-Grafik"),
  text: z.string().max(80).optional()
    .describe("Nur für poster/social: kurzer deutscher Titeltext, der groß und lesbar auf dem Bild stehen soll. Sonst weglassen (dann ohne Text)."),
});
type ImageInput = z.infer<typeof imageInput>;

/** In-flight generations per wallet (parallel tool calls share the daily cap). */
const inFlight = new Map<string, number>();

function clipPrompt(s: string, max = 300): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export const RESULT_NOTE =
  "Das Bild wird dem Menschen im Chat bereits angezeigt — beschreibe es höchstens in einem Satz und schick den Link nicht noch einmal. " +
  "Soll es in einen Feed-Beitrag, eine Veranstaltung oder ein Inserat, gib imageUrl an create_feed_post, submit_event oder create_listing weiter. " +
  "Für Änderungen rufe generate_image mit sourceImageUrl = dieser imageUrl auf.";

export const generateImage: HarnessTool<ImageInput> = {
  name: "generate_image",
  pack: "images",
  risk: "private",
  description:
    "Erstellt ein Bild mit KI (Foto, Plakat, Speisenfoto, Illustration, Social-Media-Grafik) und zeigt es im Chat. " +
    "Mit sourceImageUrl wird ein Bild aus diesem Chat als Vorlage bearbeitet. Schreib das Motiv konkret. " +
    "Tageslimit je nach Abo (5 / 30 / 100). Das Ergebnis enthält imageUrl zur Weiterverwendung.",
  inputSchema: imageInput,
  summarize: ({ prompt, sourceImageUrl }) => `${sourceImageUrl ? "Bild bearbeiten" : "Bild erstellen"}: „${clipPrompt(prompt, 70)}“`,
  execute: async (input, ctx) => {
    const style = input.style ?? "photo";
    const aspect = aspectFor(style, input.aspect);

    // Gates before any card exists: source image, daily cap.
    let sourceUrl: string | null = null;
    if (input.sourceImageUrl) {
      const ref = validateSourceImage(input.sourceImageUrl, {
        supabaseUrl: imagesDeps.supabaseUrl(), wallet: ctx.wallet, threadId: ctx.threadId,
        threadUrls: await imagesDeps.threadUrls(ctx.threadId),
      });
      sourceUrl = await imagesDeps.fetchableUrl(ref, input.sourceImageUrl);
    }
    const [tier, used] = await Promise.all([imagesDeps.tier(ctx.wallet), imagesDeps.imagesToday(ctx.wallet)]);
    const pending = inFlight.get(ctx.wallet) ?? 0;
    const cap = imageCapState(used + pending, tier);
    if (cap.exceeded) throw new ToolInputError(imageCapMessage(tier, cap.limit));

    inFlight.set(ctx.wallet, pending + 1);
    const base: GeneratedImagePart = {
      type: "generated_image", imageId: randomUUID(), status: "generating",
      prompt: clipPrompt(input.prompt), ...NOMINAL_SIZE[aspect],
    };
    publishImagePart(ctx, base);
    try {
      const prompt = buildImagePrompt({ prompt: input.prompt, style, text: input.text, hasSource: Boolean(sourceUrl) });
      const image = await imagesDeps.generate(prompt, sourceUrl ? [sourceUrl] : [], aspect);
      const stored = await imagesDeps.store(ctx.threadId, image);
      const done: GeneratedImagePart = {
        ...base, status: "done", url: stored.url,
        width: stored.width ?? base.width, height: stored.height ?? base.height,
      };
      publishImagePart(ctx, done);
      await imagesDeps.recordRun(ctx, true).catch((err) => console.error("[images] record run", err));
      return {
        ok: true, imageId: base.imageId, imageUrl: stored.url, width: done.width, height: done.height,
        aiGenerated: true, remainingToday: Math.max(0, cap.remaining - 1), note: RESULT_NOTE,
      };
    } catch (err) {
      console.error("[images] generate_image failed", err);
      const reason = germanReason(err);
      publishImagePart(ctx, { ...base, status: "failed", error: reason });
      await imagesDeps.recordRun(ctx, false, err instanceof Error ? err.message : String(err))
        .catch((e) => console.error("[images] record run", e));
      return { error: `${reason} Sag das kurz und biete an, es mit einer anderen Beschreibung zu versuchen.` };
    } finally {
      const n = (inFlight.get(ctx.wallet) ?? 1) - 1;
      if (n > 0) inFlight.set(ctx.wallet, n); else inFlight.delete(ctx.wallet);
    }
  },
};

/** Generation failure whose message is already German and safe to show. */
export class ImageGenError extends Error {
  readonly isImageGenError = true;
}

/** German, user-safe reason: ImageGenError messages as-is, everything else generic. */
export function germanReason(err: unknown): string {
  if (err && typeof err === "object" && (err as { isImageGenError?: unknown }).isImageGenError === true) {
    return (err as Error).message;
  }
  return "Das Bild konnte gerade nicht erstellt werden.";
}

export const IMAGE_TOOLS: HarnessTool[] = [generateImage];

export function register(registry: ToolRegistry): void {
  for (const t of IMAGE_TOOLS) registry.registerTool(t);
}
