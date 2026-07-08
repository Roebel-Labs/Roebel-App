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
import { streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { buildHtmlSystemPrompt, buildIterationSuffix } from "@/lib/miniapp/ai/htmlPrompt";
import { codegenModel, codegenProviderOptions, hasCodegenKey } from "@/lib/miniapp/ai/model";
import { analyzeImagesForBrief } from "@/lib/miniapp/ai/vision";

export const maxDuration = 300;
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
  const { messages, html, complexity } = parsed.data;
  if (messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "last_message_must_be_user" }, { status: 400 });
  }

  if (!hasCodegenKey()) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // Attached images (last user turn only): GLM-4.6V → implementation brief.
  // Non-blocking: a failed analysis falls back to the plain text prompt.
  const lastMsg = messages[messages.length - 1];
  let visionBrief: string | null = null;
  if (lastMsg.images && lastMsg.images.length > 0) {
    visionBrief = await analyzeImagesForBrief(
      lastMsg.images.map((dataUrl) => ({ dataUrl })),
      lastMsg.content,
    );
  }

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

  try {
    const result = streamText({
      model: codegenModel(),
      system: buildHtmlSystemPrompt(),
      messages: modelMessages,
      providerOptions: codegenProviderOptions(complexity ?? "default"),
      maxOutputTokens: 32000,
      onError: (event) => {
        console.error("[mini-apps/generate] stream error", event.error);
      },
    });
    return result.toTextStreamResponse();
  } catch (e) {
    console.error("[mini-apps/generate] streamText threw", e);
    return Response.json({ error: "generation_failed" }, { status: 500 });
  }
}
