/**
 * Model selection for the AI Mini App Builder (codegen, manifest draft, CMS plan).
 *
 * `CODEGEN_PROVIDER`:
 * - unset / `zai`: Z.ai GLM-5.2 on the official z.ai API (`Z_API_KEY`, coding-plan endpoint;
 *   `Z_API_BASE_URL` for pay-as-you-go). Chinese provider — not for business/public customers.
 * - `anthropic`: Claude on the Anthropic API (`ANTHROPIC_API_KEY`, `CODEGEN_ANTHROPIC_MODEL`,
 *   default Sonnet 5.5). Processed in the US. Live since 2026-11-23 (z.ai ran out of balance).
 * - `bedrock` (planned): Claude on AWS Bedrock in the EU via @ai-sdk/amazon-bedrock 4.x
 *   (BEDROCK_API_KEY, BEDROCK_REGION, CODEGEN_BEDROCK_MODEL; Vercel reserves AWS_*).
 *
 * "Schnell/Stark": GLM thinking off/on. Claude Sonnet 5.5 always thinks adaptively (a fixed
 * thinking budget is rejected with a 400), so no extra options are sent for Claude.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const CODEGEN_MODEL = "glm-5.2" as const;
const ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export type CodegenProvider = "zai" | "anthropic";

export function codegenProvider(env: NodeJS.ProcessEnv = process.env): CodegenProvider {
  const p = env.CODEGEN_PROVIDER?.trim().toLowerCase();
  return p === "anthropic" ? p : "zai";
}

export function hasCodegenKey(env: NodeJS.ProcessEnv = process.env): boolean {
  switch (codegenProvider(env)) {
    case "anthropic":
      return Boolean(env.ANTHROPIC_API_KEY);
    default:
      return Boolean(env.Z_API_KEY);
  }
}

/** The codegen model (provider created lazily so env is read at request time). */
export function codegenModel() {
  const env = process.env;
  const provider = codegenProvider(env);
  if (provider === "anthropic") {
    return anthropic(env.CODEGEN_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL);
  }
  const zai = createOpenAICompatible({
    name: "zai",
    baseURL: env.Z_API_BASE_URL || ZAI_BASE_URL,
    apiKey: env.Z_API_KEY ?? "",
  });
  return zai(CODEGEN_MODEL);
}

/** Provider options for a codegen call, keyed by the active provider's name. */
export function codegenProviderOptions(complexity: "default" | "hard" = "default") {
  if (codegenProvider() !== "zai") return {};
  return {
    zai: { thinking: { type: complexity === "hard" ? "enabled" : "disabled" } },
  };
}
