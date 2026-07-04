/**
 * POST /api/mini-apps/generate — chat-iterative single-file codegen (builder v2).
 *
 * Streams a complete HTML mini-app document. First turn: build from the idea.
 * Later turns: the current document is appended to the newest user message and
 * the model returns the FULL updated document (LlamaCoder-style iteration —
 * prior assistant turns arrive as short summaries, not full code, to keep the
 * context small).
 *
 * Body: {
 *   messages: { role: "user" | "assistant"; content: string }[]  (≤24, newest last, ends with a user turn)
 *   html?: string                 current document for iteration turns
 *   complexity?: "default" | "hard"
 * }
 * Response: raw text stream of the HTML document.
 */
import { streamText, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { buildHtmlSystemPrompt, buildIterationSuffix } from "@/lib/miniapp/ai/htmlPrompt";
import { codegenModelId } from "@/lib/miniapp/ai/model";

export const maxDuration = 300;
export const runtime = "nodejs";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(24),
  html: z.string().max(900_000).optional(),
  complexity: z.enum(["default", "hard"]).optional(),
});

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // Append the current document to the newest user turn for iteration.
  const modelMessages: ModelMessage[] = messages.map((m, i) => ({
    role: m.role,
    content:
      i === messages.length - 1 && html ? m.content + buildIterationSuffix(html) : m.content,
  }));

  try {
    const result = streamText({
      model: anthropic(codegenModelId(complexity ?? "default")),
      system: buildHtmlSystemPrompt(),
      messages: modelMessages,
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
