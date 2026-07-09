/**
 * POST /api/mini-apps/generate — chat-iterative single-file codegen (builder v2).
 *
 * Streams a complete HTML mini-app document from Z.ai GLM-5.2. First turn:
 * build from the idea. Later turns: the current document is appended to the
 * newest user message and the model returns the FULL updated document
 * (LlamaCoder-style iteration — prior assistant turns arrive as short
 * summaries, not full code, to keep the context small).
 *
 * Body: {
 *   messages: { role: "user" | "assistant"; content: string; images?: string[] }[]
 *     (≤24, newest last, ends with a user turn; images = data URLs, only the
 *      LAST user turn's images are analyzed — GLM-4.6V turns them into a
 *      German implementation brief that rides along into the GLM-5.2 prompt)
 *   html?: string                 current document for iteration turns
 *   complexity?: "default" | "hard"
 * }
 * Response: raw text stream of the HTML document.
 */
import { waitUntil } from "@vercel/functions";
import { streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { buildHtmlSystemPrompt, buildIterationSuffix } from "@/lib/miniapp/ai/htmlPrompt";
import { writeJobState, type GenerationJobState } from "@/lib/miniapp/ai/jobs";
import { codegenModel, codegenProviderOptions, hasCodegenKey } from "@/lib/miniapp/ai/model";
import { analyzeImagesForBrief } from "@/lib/miniapp/ai/vision";

// 800s needs Fluid compute (Pro). Budget: vision ≤75s + GLM thinking (can be
// minutes on "Stark") + the stream itself. Vercel clamps to the plan max.
export const maxDuration = 800;
export const runtime = "nodejs";

const imageDataUrl = z
  .string()
  .max(1_800_000) // ~1.3MB binary per image (client downscales to ≤1280px JPEG)
  .regex(/^data:image\/(png|jpeg|webp);base64,/);

const bodySchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(8000),
          images: z.array(imageDataUrl).max(4).optional(),
        }),
      )
      .min(1)
      .max(24),
    html: z.string().max(900_000).optional(),
    complexity: z.enum(["default", "hard"]).optional(),
    /** 2 → NDJSON frames (status/brief/think/html/ping); absent → legacy raw text. */
    protocol: z.literal(2).optional(),
  })
  .refine(
    (b) =>
      b.messages.reduce((n, m) => n + (m.images ?? []).reduce((s, i) => s + i.length, 0), 0) <=
      3_600_000,
    { message: "images_too_large" },
  );

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const { messages, html, complexity, protocol } = parsed.data;
  if (messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "last_message_must_be_user" }, { status: 400 });
  }

  if (!hasCodegenKey()) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // The response must start streaming IMMEDIATELY: vision analysis (≤75s) and
  // GLM's thinking phase (minutes on "Stark") both run before the first model
  // token, and Vercel only counts a function as responding once bytes flow —
  // waiting silently produced a 504 after the full maxDuration (2026-07-08).
  // So: return a stream now, heartbeat with newlines (the client trims leading
  // whitespace) while vision + thinking run, then pipe the document through.
  const lastMsg = messages[messages.length - 1];
  const encoder = new TextEncoder();

  const ndjson = protocol === 2;
  // Background job (NDJSON clients only): progress mirrors into a state file
  // so the generation SURVIVES the client — laptop sleep, tab close, reload.
  // The client resumes via GET /api/mini-apps/generate/status?job=<id>.
  const jobId = ndjson ? crypto.randomUUID() : null;
  const job: GenerationJobState | null = jobId
    ? {
        jobId,
        status: "running",
        phase: lastMsg.images?.length ? "vision" : "thinking",
        thinkingTail: "",
        html: "",
        chars: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    : null;
  let lastMirror = 0;
  const mirror = async (force = false) => {
    if (!job) return;
    const now = Date.now();
    if (!force && now - lastMirror < 3000) return;
    lastMirror = now;
    await writeJobState(job);
  };

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const work = (async () => {
    {
      let closed = false;
      const enqueue = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true; // client went away — job mirroring keeps the work alive
        }
      };
      // NDJSON: one JSON object per line. Legacy: raw text (heartbeat = bare
      // newline, safe only BEFORE the document starts).
      const frame = (t: string, v?: string) =>
        enqueue(JSON.stringify(v === undefined ? { t } : { t, v }) + "\n");

      // Flush headers right away — Vercel 504s a function that stays silent.
      if (ndjson) frame("ping");
      else enqueue("\n");
      if (jobId) {
        frame("job", jobId);
        await mirror(true); // job must be findable before anything slow runs
      }
      const keepalive = setInterval(() => (ndjson ? frame("ping") : enqueue("\n")), 10_000);

      try {
        // Attached images (last user turn only): GLM-4.6V → implementation
        // brief. Non-blocking: a failed analysis falls back to plain text.
        let visionBrief: string | null = null;
        if (lastMsg.images && lastMsg.images.length > 0) {
          if (ndjson) frame("status", "vision");
          visionBrief = await analyzeImagesForBrief(
            lastMsg.images.map((dataUrl) => ({ dataUrl })),
            lastMsg.content,
          );
          if (ndjson && visionBrief) frame("brief", visionBrief);
          if (job) {
            job.phase = "thinking";
            if (visionBrief) job.brief = visionBrief;
            await mirror(true);
          }
        }
        if (ndjson) frame("status", "code");

        // Append the vision brief + current document to the newest user turn.
        const modelMessages: ModelMessage[] = messages.map((m, i) => {
          if (i !== messages.length - 1) return { role: m.role, content: m.content };
          let content = m.content;
          if (visionBrief) {
            content += `\n\n[Bildanalyse der angehängten Vorlage(n)]\n${visionBrief}`;
          } else if (m.images && m.images.length > 0) {
            content += `\n\n(Hinweis: Es wurden ${m.images.length} Bild(er) angehängt, deren Analyse gerade nicht verfügbar war — setze die Textbeschreibung bestmöglich um.)`;
          }
          if (html) content += buildIterationSuffix(html);
          return { role: m.role, content };
        });

        const result = streamText({
          model: codegenModel(),
          system: buildHtmlSystemPrompt(),
          messages: modelMessages,
          providerOptions: codegenProviderOptions(complexity ?? "default"),
          // "Stark" reasoning tokens count AGAINST this budget — 32k proved too
          // small for long thinking + a content-rich app (doc truncated
          // mid-script, 2026-07-08). GLM-5.2 supports 128K output.
          maxOutputTokens: 64000,
          onError: (event) => {
            console.error("[mini-apps/generate] stream error", event.error);
          },
        });

        if (ndjson) {
          // fullStream also carries the model's reasoning ("Stark" mode) —
          // streamed to the chat as the AI's live Gedankengang. Frames keep
          // channels separated, so keepalives stay safe throughout.
          for await (const part of result.fullStream) {
            const p = part as { type: string; text?: string; textDelta?: string; error?: unknown };
            const delta = p.text ?? p.textDelta ?? "";
            if (p.type === "reasoning-delta" || p.type === "reasoning") {
              if (delta) {
                frame("think", delta);
                if (job) {
                  job.thinkingTail = (job.thinkingTail + delta).slice(-1500);
                  await mirror();
                }
              }
            } else if (p.type === "text-delta") {
              if (delta) {
                frame("html", delta);
                if (job) {
                  job.phase = "building";
                  job.html += delta;
                  job.chars = job.html.length;
                  await mirror();
                }
              }
            } else if (p.type === "error") {
              console.error("[mini-apps/generate] stream part error", p.error);
            }
          }
          // Why the stream ended — 'length' = output budget hit (doc truncated);
          // the client turns that into a precise error instead of a broken app.
          const finish = await result.finishReason.catch(() => "unknown");
          frame("done", String(finish));
          if (job) {
            job.status = "done";
            job.finishReason = String(finish);
            job.chars = job.html.length;
            await mirror(true);
          }
        } else {
          let firstChunk = true;
          for await (const chunk of result.textStream) {
            if (firstChunk) {
              firstChunk = false;
              // No keepalives once real content flows — a stray newline inside
              // the document would corrupt it.
              clearInterval(keepalive);
            }
            enqueue(chunk);
          }
        }
      } catch (e) {
        console.error("[mini-apps/generate] generation failed", e);
        if (job) {
          job.status = "error";
          job.error = e instanceof Error ? e.message : String(e);
          await mirror(true);
        }
      } finally {
        clearInterval(keepalive);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    }
  })();

  // Keep the invocation alive to job completion even when the client
  // disconnects (laptop sleep / tab close) — the editor resumes via the job.
  waitUntil(work);

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      // disable proxy buffering so heartbeats actually reach the client
      "x-accel-buffering": "no",
    },
  });
}
