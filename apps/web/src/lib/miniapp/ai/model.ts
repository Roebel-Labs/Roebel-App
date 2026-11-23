/**
 * Model selection for the AI Mini App Builder (codegen, manifest draft, CMS plan).
 *
 * Default: Z.ai GLM-5.2 on the official z.ai API (user mandate 2026-07-04), via
 * `@ai-sdk/openai-compatible` (pinned 2.x — 3.x targets a newer model-spec than this repo's
 * `ai@6`). Auth `Z_API_KEY`; default endpoint is the GLM Coding Plan one, pay-as-you-go keys use
 * https://api.z.ai/api/paas/v4 via `Z_API_BASE_URL`.
 *
 * Switch: `CODEGEN_PROVIDER=anthropic` runs the builder on Claude (`CODEGEN_ANTHROPIC_MODEL`,
 * default Sonnet 5.5) with the platform `ANTHROPIC_API_KEY`. z.ai is a Chinese provider, which
 * business and public-sector customers will not accept (spec 2026-11-23 §5). Note: the direct
 * Anthropic API is not EU-resident; an EU region needs Bedrock/Vertex (not wired yet).
 *
 * "Schnell/Stark" maps to thinking off/on on both providers.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const CODEGEN_MODEL = "glm-5.2" as const;
const ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export type CodegenProvider = "zai" | "anthropic";

export function codegenProvider(env: NodeJS.ProcessEnv = process.env): CodegenProvider {
  return env.CODEGEN_PROVIDER?.trim().toLowerCase() === "anthropic" ? "anthropic" : "zai";
}

export function hasCodegenKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return codegenProvider(env) === "anthropic" ? Boolean(env.ANTHROPIC_API_KEY) : Boolean(env.Z_API_KEY);
}

/** The codegen model (provider created lazily so env is read at request time). */
export function codegenModel() {
  if (codegenProvider() === "anthropic") {
    return anthropic(process.env.CODEGEN_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL);
  }
  const zai = createOpenAICompatible({
    name: "zai",
    baseURL: process.env.Z_API_BASE_URL || ZAI_BASE_URL,
    apiKey: process.env.Z_API_KEY ?? "",
  });
  return zai(CODEGEN_MODEL);
}

/** Provider options for a codegen call, keyed by the active provider's name. */
export function codegenProviderOptions(complexity: "default" | "hard" = "default") {
  if (codegenProvider() === "anthropic") {
    return complexity === "hard"
      ? { anthropic: { thinking: { type: "enabled" as const, budgetTokens: 12_000 } } }
      : {};
  }
  return {
    zai: { thinking: { type: complexity === "hard" ? "enabled" : "disabled" } },
  };
}
