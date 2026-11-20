// Audio and video in the chat (kie.ai, same job endpoint as the images pack):
//   generate_speech  text → spoken MP3 (ElevenLabs multilingual v2)
//   generate_music   description → song or instrumental (Suno)
//   generate_video   description (+ optional image from this chat) → short clip (Seedance)
//   media_status     picks up a job that outlasted the turn
//
// Flow: start the kie job → wait inside the turn (speech is seconds, music and video
// are minutes) → copy the result into the public `images` bucket under
// chat/agents/<threadId>/media/ (kie.ai deletes results after 14 days) → show it as a
// `sources` link card, which every existing client already renders. A job that is not
// done when the wait ends returns a jobId; the model calls media_status later.
//
// These tools ride on the 'images' pack: a bot that may create images may create media.
// Risk 'private': nothing leaves the chat.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ToolInputError } from "../errors";
import type { ChatTier } from "../../types";
import type { HarnessContext, HarnessTool, ToolRegistry } from "../types";
import {
  MUSIC_PROMPT_MAX_CHARS, SPEECH_MAX_CHARS, SPEECH_VOICE_NAMES, VIDEO_ASPECTS, VIDEO_DURATIONS,
  buildMusicPayload, buildSpeechPayload, buildVideoPayload, decodeJobId, encodeJobId, markSyntheticMp3,
  mediaContentType, mediaExtension, parseMediaJob,
  type MediaJobState, type MediaKind,
} from "../../../media/kie-media";
import { IMAGE_BUCKET, IMAGE_PREFIX, imagesDeps, validateSourceImage } from "./images";

// ---- constants -----------------------------------------------------------------------

/** Jobs per Berlin day and tier. Video and music cost many times an image, so they are scarcer. */
export const MEDIA_DAILY_LIMITS: Record<MediaKind, Record<ChatTier, number>> = {
  speech: { free: 10, plus: 60, ultra: 200 },
  music: { free: 2, plus: 10, ultra: 40 },
  video: { free: 1, plus: 10, ultra: 40 },
};

/** How long a turn waits for the job before handing back a jobId (chat route budget: 300 s). */
export const MEDIA_WAIT_MS: Record<MediaKind, number> = { speech: 60_000, music: 170_000, video: 170_000 };
const POLL_INTERVAL_MS = 4000;
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
/** Music jobs return two takes; both are kept. */
const MAX_RESULTS = 2;
/** ASSUMPTION (kie.ai price list, not in the API docs): 1 credit = 0.005 USD. Only feeds chat_runs.cost_micros. */
const MICROS_PER_KIE_CREDIT = 5000;

const START_ROUTE = (kind: MediaKind) => `media-start:${kind}`;
const DONE_ROUTE = (kind: MediaKind) => `media:${kind}`;

const KIND_LABEL: Record<MediaKind, string> = { speech: "Sprachaufnahme", music: "Musik", video: "Video" };
const KIND_NOUN: Record<MediaKind, string> = { speech: "Die Sprachaufnahme", music: "Die Musik", video: "Das Video" };

// ---- pure helpers ------------------------------------------------------------------------

export function mediaCapState(used: number, kind: MediaKind, tier: ChatTier): { limit: number; remaining: number; exceeded: boolean } {
  const limits = MEDIA_DAILY_LIMITS[kind];
  const limit = limits[tier] ?? limits.free;
  return { limit, remaining: Math.max(0, limit - used), exceeded: used >= limit };
}

export function mediaCapMessage(kind: MediaKind, tier: ChatTier, limit: number): string {
  const upsell = tier === "ultra" ? "" : " Mit einem größeren Abo ist mehr möglich.";
  return `Das Tageslimit für ${KIND_LABEL[kind]} ist erreicht (${limit} pro Tag). Morgen geht es wieder.${upsell}`;
}

export function mediaObjectPath(threadId: string, kind: MediaKind, id: string = randomUUID()): string {
  return `${IMAGE_PREFIX}/${threadId}/media/${id}.${mediaExtension(kind)}`;
}

function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Title of the link card. Says what it is and that it is AI generated (AI Act Art. 50). */
export function mediaTitle(kind: MediaKind, label: string, index: number, total: number): string {
  const take = total > 1 ? ` (Variante ${index + 1})` : "";
  return `${KIND_LABEL[kind]}${take}, KI-erzeugt: ${clip(label, 60)}`;
}

/** Vendor failure text → German, user-safe. The vendor text is logged, never shown. */
export function mediaFailureMessage(kind: MediaKind, vendorError: string): string {
  if (/sensitive|nsfw|safety|policy|moderation|violat/i.test(vendorError)) {
    return `${KIND_NOUN[kind]} wurde vom Inhaltsfilter abgelehnt. Bitte beschreibe es anders.`;
  }
  return `${KIND_NOUN[kind]} konnte gerade nicht erstellt werden.`;
}

// ---- I/O seams (stubbed in tests) --------------------------------------------------------

async function adminDb() {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

export class MediaGenError extends Error {
  readonly isMediaGenError = true;
}

function germanReason(kind: MediaKind, err: unknown): string {
  if (err && typeof err === "object" && (err as { isMediaGenError?: unknown }).isMediaGenError === true) {
    return (err as Error).message;
  }
  return `${KIND_NOUN[kind]} konnte gerade nicht erstellt werden.`;
}

export const mediaDeps = {
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  now(): number {
    return Date.now();
  },
  async startedToday(wallet: string, kind: MediaKind): Promise<number> {
    const { quotaWindowStart } = await import("../../quota");
    const res = await (await adminDb()).from("chat_runs").select("id", { count: "exact", head: true })
      .eq("owner_wallet", wallet).eq("route", START_ROUTE(kind)).eq("status", "ok")
      .gte("created_at", quotaWindowStart());
    if (res.error) throw new Error(`[media] count: ${res.error.message}`);
    return res.count ?? 0;
  },
  /** chat_runs row per job. `error` carries the kie taskId so media_status can check ownership. */
  async recordJob(ctx: HarnessContext, route: string, taskId: string, costMicros: number): Promise<void> {
    const store = await import("../../store");
    await store.recordRun({
      wallet: ctx.wallet, threadId: ctx.threadId, botId: ctx.botId, route,
      inputTokens: 0, outputTokens: 0, costMicros, status: "ok", error: taskId,
    });
  },
  async jobRowExists(wallet: string, route: string, taskId: string): Promise<boolean> {
    const res = await (await adminDb()).from("chat_runs").select("id", { count: "exact", head: true })
      .eq("owner_wallet", wallet).eq("route", route).eq("error", taskId);
    if (res.error) throw new Error(`[media] job lookup: ${res.error.message}`);
    return (res.count ?? 0) > 0;
  },
  async createJob(payload: Record<string, unknown>): Promise<string> {
    const { kieFetch } = await import("../../../images/kie");
    const res = await kieFetch({ action: "createTask", payload });
    const json = (await res.json().catch(() => ({}))) as { code?: number; msg?: string; data?: { taskId?: string } };
    const taskId = json.data?.taskId;
    if (!res.ok || !taskId) {
      // kie.ai reports business errors as HTTP 200 with a body code.
      console.error("[media] createTask failed:", res.status, json.code, String(json.msg ?? "").slice(0, 300));
      if (json.code === 402 || /credit|balance|insufficient/i.test(String(json.msg ?? ""))) {
        throw new MediaGenError("Das Guthaben für die Erstellung ist gerade aufgebraucht. Bitte später noch einmal versuchen.");
      }
      throw new MediaGenError("Die Erstellung konnte nicht gestartet werden.");
    }
    return taskId;
  },
  async pollJob(taskId: string): Promise<MediaJobState> {
    const { kieFetch } = await import("../../../images/kie");
    const res = await kieFetch({ action: "recordInfo", taskId });
    if (!res.ok) return { state: "pending" };
    return parseMediaJob(await res.json().catch(() => null));
  },
  /** Downloads a result, marks MP3s as AI generated and stores it in our own bucket. */
  async persist(threadId: string, kind: MediaKind, url: string, generator: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new MediaGenError("Das Ergebnis konnte nicht geladen werden.");
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_DOWNLOAD_BYTES) throw new MediaGenError("Das Ergebnis ist zu groß zum Speichern.");
    let bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new MediaGenError("Das Ergebnis ist zu groß zum Speichern.");
    if (kind !== "video") {
      // AI Act Art. 50(2): the marking lives inside the file. MP4 has no marking yet.
      const marked = markSyntheticMp3(bytes, generator);
      if (!marked.marked) console.warn("[media] unmarkable audio result");
      bytes = marked.bytes as Uint8Array<ArrayBuffer>;
    }
    const path = mediaObjectPath(threadId, kind);
    const db = await adminDb();
    // 1-year cacheControl = "already processed" marker of the images bucket (see images.ts).
    const up = await db.storage.from(IMAGE_BUCKET).upload(path, Buffer.from(bytes), {
      contentType: mediaContentType(kind), upsert: false, cacheControl: "31536000",
    });
    if (up.error) throw new Error(`[media] upload: ${up.error.message}`);
    return db.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  },
};

// ---- shared job flow ---------------------------------------------------------------------

/** In-flight starts per wallet and kind (parallel tool calls share the daily cap). */
const inFlight = new Map<string, number>();

const DONE_NOTE =
  "Der Link wird dem Menschen im Chat bereits als Karte angezeigt. Sag in einem Satz, was entstanden ist, " +
  "und wiederhole den Link nicht. Erwähne, dass es mit KI erzeugt wurde, wenn er es weitergeben will.";

async function deliver(
  ctx: HarnessContext, kind: MediaKind, taskId: string, label: string, generator: string,
  job: Extract<MediaJobState, { state: "success" }>,
): Promise<Record<string, unknown>> {
  const sources = job.urls.slice(0, MAX_RESULTS);
  const stored: string[] = [];
  for (const url of sources) stored.push(await mediaDeps.persist(ctx.threadId, kind, url, generator));
  ctx.emitPart({
    type: "sources",
    items: stored.map((url, i) => ({ title: mediaTitle(kind, label, i, stored.length), url })),
  });
  const costMicros = Math.round((job.credits ?? 0) * MICROS_PER_KIE_CREDIT);
  await mediaDeps.recordJob(ctx, DONE_ROUTE(kind), taskId, costMicros)
    .catch((err) => console.error("[media] record done", err));
  return { ok: true, kind, urls: stored, aiGenerated: true, note: DONE_NOTE };
}

async function waitFor(kind: MediaKind, taskId: string): Promise<MediaJobState> {
  const deadline = mediaDeps.now() + MEDIA_WAIT_MS[kind];
  for (;;) {
    const job = await mediaDeps.pollJob(taskId);
    if (job.state !== "pending") return job;
    if (mediaDeps.now() + POLL_INTERVAL_MS >= deadline) return job;
    await mediaDeps.sleep(POLL_INTERVAL_MS);
  }
}

async function runJob(
  ctx: HarnessContext, kind: MediaKind, payload: Record<string, unknown>, label: string,
): Promise<Record<string, unknown>> {
  const key = `${ctx.wallet}:${kind}`;
  const [tier, used] = await Promise.all([imagesDeps.tier(ctx.wallet), mediaDeps.startedToday(ctx.wallet, kind)]);
  const pending = inFlight.get(key) ?? 0;
  const cap = mediaCapState(used + pending, kind, tier);
  if (cap.exceeded) throw new ToolInputError(mediaCapMessage(kind, tier, cap.limit));

  inFlight.set(key, pending + 1);
  const generator = `Röbel App / kie.ai ${String(payload.model)}`;
  try {
    const taskId = await mediaDeps.createJob(payload);
    // Counted against the daily cap from the start: a job that outlasts the turn still costs.
    await mediaDeps.recordJob(ctx, START_ROUTE(kind), taskId, 0);
    const job = await waitFor(kind, taskId);
    if (job.state === "fail") {
      console.error("[media] job failed:", kind, taskId, job.error);
      return { error: `${mediaFailureMessage(kind, job.error)} Sag das kurz und biete einen neuen Versuch an.` };
    }
    if (job.state === "pending") {
      return {
        pending: true, jobId: encodeJobId(kind, taskId),
        note: `${KIND_NOUN[kind]} ist noch in Arbeit. Sag dem Menschen, dass es noch ein paar Minuten dauert, ` +
          "und rufe media_status mit dieser jobId auf, sobald er wieder schreibt oder nachfragt. Starte keinen zweiten Auftrag.",
      };
    }
    return { ...(await deliver(ctx, kind, taskId, label, generator, job)), remainingToday: Math.max(0, cap.remaining - 1) };
  } catch (err) {
    console.error(`[media] ${kind} failed`, err);
    return { error: `${germanReason(kind, err)} Sag das kurz und biete einen neuen Versuch an.` };
  } finally {
    const n = (inFlight.get(key) ?? 1) - 1;
    if (n > 0) inFlight.set(key, n); else inFlight.delete(key);
  }
}

// ---- generate_speech -----------------------------------------------------------------------

const speechInput = z.object({
  text: z.string().min(2).max(SPEECH_MAX_CHARS)
    .describe("Der Text, der gesprochen werden soll, genau so wie er klingen soll. Ohne Regieanweisungen, Links oder Markdown."),
  voice: z.enum(SPEECH_VOICE_NAMES).optional()
    .describe("Stimme: lutz (Standard, männlich), leon (männlich), brian (männlich, tief), emma (weiblich), laura (weiblich, jung)."),
  speed: z.number().min(0.7).max(1.2).optional().describe("Sprechtempo, 1 = normal."),
});
type SpeechInput = z.infer<typeof speechInput>;

export const generateSpeech: HarnessTool<SpeechInput> = {
  name: "generate_speech",
  pack: "images",
  risk: "private",
  description:
    "Liest einen Text als natürliche Sprachaufnahme ein (MP3), zum Beispiel eine Ansage, eine Begrüßung, " +
    "einen Beitrag zum Anhören oder den Sprechertext für ein Video. Höchstens 5000 Zeichen pro Aufruf. " +
    "Schreib Zahlen, Abkürzungen und Uhrzeiten so aus, wie sie gesprochen werden.",
  inputSchema: speechInput,
  summarize: ({ text }) => `Text einsprechen: „${clip(text, 70)}“`,
  execute: (input, ctx) =>
    runJob(ctx, "speech", buildSpeechPayload({ text: input.text, voice: input.voice, speed: input.speed }), input.text),
};

// ---- generate_music ------------------------------------------------------------------------

const musicInput = z.object({
  prompt: z.string().min(5).max(MUSIC_PROMPT_MAX_CHARS)
    .describe("Beschreibung der Musik: Stil, Stimmung, Tempo, Instrumente, Anlass und worum der Text gehen soll."),
  instrumental: z.boolean().optional().describe("true = ohne Gesang (Hintergrundmusik, Jingle). Standard: mit Gesang."),
});
type MusicInput = z.infer<typeof musicInput>;

export const generateMusic: HarnessTool<MusicInput> = {
  name: "generate_music",
  pack: "images",
  risk: "private",
  description:
    "Erstellt Musik mit KI: ein Lied mit Gesang oder ein Instrumentalstück (Jingle, Hintergrundmusik für ein Video, " +
    "Vereinslied, Geburtstagsständchen). Liefert meist zwei Varianten und dauert ein paar Minuten. " +
    "Keine echten Künstler, Bands oder bestehenden Lieder als Vorlage nennen, beschreibe stattdessen den Stil.",
  inputSchema: musicInput,
  summarize: ({ prompt }) => `Musik erstellen: „${clip(prompt, 70)}“`,
  execute: (input, ctx) =>
    runJob(ctx, "music", buildMusicPayload({ prompt: input.prompt, instrumental: input.instrumental }), input.prompt),
};

// ---- generate_video ------------------------------------------------------------------------

const videoInput = z.object({
  prompt: z.string().min(5).max(2000)
    .describe("Was im Clip passiert: Motiv, Bewegung, Kamerafahrt, Licht und Stimmung. Bei einem Ausgangsbild: was sich darin bewegen soll."),
  aspect: z.enum(VIDEO_ASPECTS).optional()
    .describe("16:9 (Querformat, Standard), 9:16 (Hochformat für Storys), 1:1. Wird bei einem Ausgangsbild ignoriert."),
  duration: z.enum(VIDEO_DURATIONS).optional().describe("Länge in Sekunden: 5 (Standard) oder 10."),
  sourceImageUrl: z.string().url().max(2000).optional()
    .describe("Optional: Bild-URL eines Bildes aus DIESEM Chat (geschickt oder hier erzeugt), das als erstes Bild animiert wird."),
});
type VideoInput = z.infer<typeof videoInput>;

export const generateVideo: HarnessTool<VideoInput> = {
  name: "generate_video",
  pack: "images",
  risk: "private",
  description:
    "Erstellt einen kurzen Videoclip mit KI (5 oder 10 Sekunden, ohne Ton), aus einer Beschreibung oder aus einem Bild " +
    "dieses Chats, das in Bewegung gesetzt wird. Dauert ein paar Minuten. Für ein gutes Ergebnis erst mit generate_image " +
    "das passende Bild erstellen und es dann als sourceImageUrl übergeben. Keine echten, erkennbaren Personen darstellen.",
  inputSchema: videoInput,
  summarize: ({ prompt, sourceImageUrl }) => `${sourceImageUrl ? "Bild animieren" : "Video erstellen"}: „${clip(prompt, 70)}“`,
  execute: async (input, ctx) => {
    let imageUrl: string | null = null;
    if (input.sourceImageUrl) {
      const ref = validateSourceImage(input.sourceImageUrl, {
        supabaseUrl: imagesDeps.supabaseUrl(), wallet: ctx.wallet, threadId: ctx.threadId,
        threadUrls: await imagesDeps.threadUrls(ctx.threadId),
      });
      imageUrl = await imagesDeps.fetchableUrl(ref, input.sourceImageUrl);
    }
    const payload = buildVideoPayload({ prompt: input.prompt, aspect: input.aspect, duration: input.duration, imageUrl });
    return runJob(ctx, "video", payload, input.prompt);
  },
};

// ---- media_status --------------------------------------------------------------------------

const statusInput = z.object({
  jobId: z.string().min(8).max(160).describe("Die jobId aus generate_music, generate_video oder generate_speech."),
});
type StatusInput = z.infer<typeof statusInput>;

export const mediaStatus: HarnessTool<StatusInput> = {
  name: "media_status",
  pack: "images",
  risk: "private",
  description:
    "Prüft einen Musik-, Video- oder Sprachauftrag, der beim Start noch nicht fertig war, und zeigt das Ergebnis im Chat, " +
    "sobald es da ist. Nur mit einer jobId aus diesem Chat aufrufen.",
  inputSchema: statusInput,
  summarize: () => "Stand der Erstellung prüfen",
  execute: async ({ jobId }, ctx) => {
    const job = decodeJobId(jobId);
    if (!job) throw new ToolInputError("Unbekannte jobId.");
    // Only the person who started the job may collect it.
    if (!(await mediaDeps.jobRowExists(ctx.wallet, START_ROUTE(job.kind), job.taskId))) {
      throw new ToolInputError("Zu dieser jobId gibt es hier keinen Auftrag.");
    }
    if (await mediaDeps.jobRowExists(ctx.wallet, DONE_ROUTE(job.kind), job.taskId)) {
      return { ok: true, alreadyDelivered: true, note: "Das Ergebnis wurde bereits im Chat gezeigt." };
    }
    try {
      const state = await mediaDeps.pollJob(job.taskId);
      if (state.state === "pending") {
        return { pending: true, jobId, note: `${KIND_NOUN[job.kind]} ist noch in Arbeit. Später noch einmal prüfen.` };
      }
      if (state.state === "fail") {
        console.error("[media] job failed:", job.kind, job.taskId, state.error);
        return { error: `${mediaFailureMessage(job.kind, state.error)} Biete einen neuen Versuch an.` };
      }
      return await deliver(ctx, job.kind, job.taskId, KIND_LABEL[job.kind], "Röbel App / kie.ai", state);
    } catch (err) {
      console.error("[media] media_status failed", err);
      return { error: `${germanReason(job.kind, err)} Später noch einmal prüfen.` };
    }
  },
};

export const MEDIA_TOOLS: HarnessTool[] = [generateSpeech, generateMusic, generateVideo, mediaStatus];

export function register(registry: ToolRegistry): void {
  for (const t of MEDIA_TOOLS) registry.registerTool(t);
}
