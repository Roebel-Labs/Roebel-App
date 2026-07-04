/**
 * Model selection for the AI Mini App Builder codegen.
 *
 * Codegen runs on Z.ai's GLM-5.2 (1M context, 128K output, strong coding),
 * called on the OFFICIAL z.ai API — no OpenAI/GPT involved anywhere. The
 * Vercel AI SDK has no first-party z.ai provider, so we use the official
 * `@ai-sdk/openai-compatible` package (pinned 2.x — the 3.x line targets a
 * newer model-spec than this repo's `ai@6`) purely as protocol plumbing for
 * z.ai's OpenAI-compatible wire format. Auth: `Z_API_KEY` (server-side only).
 *
 * Default endpoint is the GLM Coding Plan one (verified working with this
 * project's key); pay-as-you-go keys use https://api.z.ai/api/paas/v4 —
 * override via Z_API_BASE_URL.
 *
 * The builder's "Schnell/Stark" toggle maps to GLM's thinking mode: one model,
 * thinking disabled for fast turns, enabled for the hardest prompts.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const CODEGEN_MODEL = "glm-5.2" as const;
const ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

export function hasCodegenKey(): boolean {
  return Boolean(process.env.Z_API_KEY);
}

/** The GLM-5.2 codegen model (provider created lazily so env is read at request time). */
export function codegenModel() {
  const zai = createOpenAICompatible({
    name: "zai",
    baseURL: process.env.Z_API_BASE_URL || ZAI_BASE_URL,
    apiKey: process.env.Z_API_KEY ?? "",
  });
  return zai(CODEGEN_MODEL);
}

/**
 * Provider options for a codegen call. Keyed by the provider `name` above —
 * the openai-compatible provider forwards them into the request body.
 */
export function codegenProviderOptions(complexity: "default" | "hard" = "default") {
  return {
    zai: { thinking: { type: complexity === "hard" ? "enabled" : "disabled" } },
  };
}
