/**
 * POST /api/mini-apps/generate
 *
 * Streams a strict JSON file-plan for a Röbel Mini App generated from a
 * natural-language prompt. Uses a strong Claude model via @ai-sdk/anthropic
 * (same wiring pattern as the Mecky chat route). ANTHROPIC_API_KEY is read
 * server-side only.
 *
 * Body: { prompt: string; appId?: string; complexity?: "default" | "hard" }
 * Response: text stream of the partial JSON object (partialObjectStream), which
 *           the builder UI parses incrementally for live preview.
 */
import { streamObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { filePlanSchema } from "@/lib/miniapp/ai/filePlan";
import {
  buildCodegenSystemPrompt,
  buildCodegenUserPrompt,
} from "@/lib/miniapp/ai/systemPrompt";
import { codegenModelId } from "@/lib/miniapp/ai/model";

// Codegen can run long; allow generous streaming time on platforms that honor it.
export const maxDuration = 300;
export const runtime = "nodejs"; // needs node:fs to load DESIGN.md + template

export async function POST(request: Request) {
  let body: { prompt?: unknown; appId?: unknown; complexity?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3) {
    return Response.json({ error: "prompt_required" }, { status: 400 });
  }
  if (prompt.length > 8000) {
    return Response.json({ error: "prompt_too_long" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const complexity = body.complexity === "hard" ? "hard" : "default";

  let system: string;
  try {
    system = await buildCodegenSystemPrompt();
  } catch (e) {
    console.error("[mini-apps/generate] failed to build system prompt", e);
    return Response.json({ error: "template_unavailable" }, { status: 500 });
  }

  try {
    const result = streamObject({
      model: anthropic(codegenModelId(complexity)),
      schema: filePlanSchema,
      system,
      prompt: buildCodegenUserPrompt(prompt),
      maxOutputTokens: 32000,
      onError: (event) => {
        console.error("[mini-apps/generate] stream error", event.error);
      },
    });

    // Streams the partial JSON object as it is generated. The builder UI reads
    // this with the AI SDK client or by parsing the growing JSON text.
    return result.toTextStreamResponse();
  } catch (e) {
    console.error("[mini-apps/generate] streamObject threw", e);
    return Response.json({ error: "generation_failed" }, { status: 500 });
  }
}
