// GWDG SAIA (AcademicCloud / KISSKI): OpenAI-compatible open-weight models hosted in Göttingen.
// Off by default. A route only uses SAIA when SAIA_API_KEY is set AND the route is listed in
// SAIA_ROUTES (comma list, e.g. "bot-fast,stt"). Every call falls back to the regular provider
// when SAIA errors, rate-limits (429) or is slow to start (shared cluster: one-off queue spikes of
// 2+ minutes were measured on 2026-11-21).
//
// Legal gate: the GWDG terms grant use for academic purposes only. Do not list citizen-facing routes
// in SAIA_ROUTES before a contract + AVV with the GWDG exists.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const SAIA_BASE_URL = "https://chat-ai.academiccloud.de/v1";
export const SAIA_AUDIO_URL = "https://saia.gwdg.de/v1/audio/transcriptions";

/** Route → SAIA model id (benchmark 2026-11-21: German answers, tool calls, time to first token). */
export const SAIA_MODELS = {
  "bot-fast": "deepseek-v4.1-flash-1017", // ~0.3 s to first token, tools, image input
  "bot-smart": "mistral-large-4-1t-a52b", // EU vendor, strongest non-reasoning answers (~2.7 s)
  vision: "deepseek-v4.1-flash-1017",
  stt: "whisper-large-v3",
} as const;

export type SaiaRoute = keyof typeof SAIA_MODELS;

/** How long SAIA may take to produce its first token before we switch provider. */
export const SAIA_FIRST_TOKEN_MS = 8_000;
/** After a failure, skip SAIA for this long (per server instance). */
const COOLDOWN_MS = 2 * 60_000;

let downUntil = 0;

export function saiaEnabled(route: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.SAIA_API_KEY) return false;
  const routes = (env.SAIA_ROUTES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  return routes.includes(route) && Date.now() >= downUntil;
}

export function markSaiaDown(reason: unknown): void {
  downUntil = Date.now() + COOLDOWN_MS;
  console.warn("[saia] falling back for 2 min:", reason instanceof Error ? reason.message : String(reason));
}

let provider: ReturnType<typeof createOpenAICompatible> | null = null;

export function saiaChatModel(route: Exclude<SaiaRoute, "stt">, env: NodeJS.ProcessEnv = process.env) {
  provider ??= createOpenAICompatible({
    name: "saia",
    baseURL: SAIA_BASE_URL,
    apiKey: env.SAIA_API_KEY!,
    includeUsage: true,
  });
  return provider.chatModel(SAIA_MODELS[route]);
}

type ChatModel = ReturnType<typeof saiaChatModel>;
type CallOptions = Parameters<ChatModel["doGenerate"]>[0];
type StreamResult = Awaited<ReturnType<ChatModel["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

/** Minimal shape both the SAIA model and the Anthropic model satisfy. */
export interface FallbackTarget {
  readonly provider: string;
  readonly modelId: string;
  doGenerate(options: CallOptions): ReturnType<ChatModel["doGenerate"]>;
  doStream(options: CallOptions): ReturnType<ChatModel["doStream"]>;
}

function timeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function withAbort(options: CallOptions, controller: AbortController): CallOptions {
  const outer = options.abortSignal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }
  return { ...options, abortSignal: controller.signal };
}

const isContent = (p: StreamPart) => p.type !== "stream-start" && p.type !== "response-metadata";

/**
 * A model that tries SAIA first and switches to `fallback` when SAIA fails or has produced no
 * content within SAIA_FIRST_TOKEN_MS. Once content has streamed, the answer stays on SAIA.
 */
export function withSaiaFallback(primary: ChatModel, fallback: FallbackTarget, firstTokenMs = SAIA_FIRST_TOKEN_MS) {
  const model = Object.create(primary) as ChatModel;
  Object.defineProperty(model, "doGenerate", {
    value: async (options: CallOptions) => {
      const controller = new AbortController();
      try {
        return await timeout(primary.doGenerate(withAbort(options, controller)), firstTokenMs * 4, "saia generate");
      } catch (err) {
        controller.abort();
        if (options.abortSignal?.aborted) throw err;
        markSaiaDown(err);
        return fallback.doGenerate(options);
      }
    },
  });
  Object.defineProperty(model, "doStream", {
    value: async (options: CallOptions): Promise<StreamResult> => {
      const controller = new AbortController();
      const started = Date.now();
      try {
        const result = await timeout(primary.doStream(withAbort(options, controller)), firstTokenMs, "saia stream");
        const reader = result.stream.getReader();
        const head: StreamPart[] = [];
        // Buffer the parts up to the first real content; give up when it takes too long.
        for (;;) {
          const left = firstTokenMs - (Date.now() - started);
          const next = await timeout(reader.read(), Math.max(left, 1), "saia first token");
          if (next.done) break;
          head.push(next.value);
          if (next.value.type === "error") throw next.value.error ?? new Error("saia stream error");
          if (isContent(next.value)) break;
        }
        const stream = new ReadableStream<StreamPart>({
          start(c) {
            for (const p of head) c.enqueue(p);
          },
          async pull(c) {
            const next = await reader.read();
            if (next.done) c.close();
            else c.enqueue(next.value);
          },
          cancel(reason) {
            return reader.cancel(reason);
          },
        });
        return { ...result, stream };
      } catch (err) {
        controller.abort();
        if (options.abortSignal?.aborted) throw err;
        markSaiaDown(err);
        return fallback.doStream(options);
      }
    },
  });
  return model;
}

/** Whisper on SAIA. Throws on any failure so the caller can fall back. */
export async function saiaTranscribe(file: File, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const body = new FormData();
  body.append("model", SAIA_MODELS.stt);
  body.append("language", "de");
  body.append("response_format", "json");
  body.append("file", file);
  const res = await fetch(SAIA_AUDIO_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAIA_API_KEY}` },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`SAIA transcription ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
