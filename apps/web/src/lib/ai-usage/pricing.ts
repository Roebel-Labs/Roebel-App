// List prices for every paid AI provider the apps call, in USD. Pure (no I/O)
// so tests and edge-function ports can share it. These are ESTIMATES at public
// list rates — the authoritative numbers are the providers' own billing APIs
// (see lib/ai-usage/billing.ts), which the KI-Kosten page shows side by side.
//
// Units: token prices are $ per 1M tokens; 1 $/MTok = 1 micro-$ per token, so
// cost_micros = Σ price × tokens without any scaling.

export interface TokenPrice {
  input: number;
  output: number;
  /** $/MTok for cache reads; defaults to 10 % of input (Anthropic). */
  cacheRead?: number;
  /** $/MTok for cache writes; defaults to 125 % of input (Anthropic 5-min TTL). */
  cacheWrite?: number;
}

/** Keyed by `${provider}:${model}` with date suffixes stripped. */
export const TOKEN_PRICES: Record<string, TokenPrice> = {
  // Anthropic (platform.claude.com pricing, 2026-10)
  "anthropic:claude-haiku-4-5": { input: 1, output: 5 },
  "anthropic:claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "anthropic:claude-sonnet-4-6": { input: 3, output: 15 },
  "anthropic:claude-sonnet-5": { input: 2, output: 10 },
  "anthropic:claude-sonnet-5-5": { input: 2, output: 10 },
  "anthropic:claude-opus-4-8": { input: 5, output: 25 },
  "anthropic:claude-opus-5": { input: 5, output: 25 },
  "anthropic:claude-opus-5-5": { input: 4, output: 20 },
  "anthropic:claude-fable-5-1": { input: 10, output: 50 },
  // OpenAI
  "openai:gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 },
  // Transcription models bill audio input tokens + text output tokens.
  "openai:gpt-4o-transcribe": { input: 6, output: 10 },
  "openai:gpt-4o-mini-transcribe": { input: 3, output: 5 },
  // Z.ai GLM runs on the GLM Coding Plan (flat subscription) — tokens are
  // tracked for volume, the marginal cost is 0.
  "zai:glm-5.2": { input: 0, output: 0 },
  "zai:glm-4.6v": { input: 0, output: 0 },
};

/** Flat per-unit prices for non-token billing. */
export const UNIT_PRICES: Record<string, { unitType: string; usdPerUnit: number }> = {
  // kie.ai credit prices per generated image (estimates from the kie.ai price list).
  "kie:nano-banana-2-lite": { unitType: "image", usdPerUnit: 0.02 },
  "kie:nano-banana-2": { unitType: "image", usdPerUnit: 0.04 },
  "kie:nano-banana-pro": { unitType: "image", usdPerUnit: 0.09 },
  "kie:seedream/4.5-text-to-image": { unitType: "image", usdPerUnit: 0.025 },
  "kie:seedream/4.5-edit": { unitType: "image", usdPerUnit: 0.025 },
  // ElevenLabs multilingual v2: 1 credit per character, ~0.30 $ per 1K credits
  // at the Creator-plan overage rate.
  "elevenlabs:eleven_multilingual_v2": { unitType: "char", usdPerUnit: 0.0003 },
  // whisper-1 bills audio minutes.
  "openai:whisper-1": { unitType: "second", usdPerUnit: 0.006 / 60 },
  // Anthropic server tool: 10 $ per 1,000 web searches.
  "anthropic:web_search": { unitType: "search", usdPerUnit: 0.01 },
};

/** `claude-haiku-4-5-20251001` → `claude-haiku-4-5`. */
export function normalizeModel(model: string): string {
  return model.trim().replace(/-\d{8}$/, "");
}

export function tokenPrice(provider: string, model: string): TokenPrice | null {
  return TOKEN_PRICES[`${provider}:${normalizeModel(model)}`] ?? null;
}

export interface TokenUsage {
  /** Uncached input tokens. */
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Estimated cost of a token-billed call in micro-USD (0 when the model is unknown). */
export function tokenCostMicros(provider: string, model: string, usage: TokenUsage): number {
  const price = tokenPrice(provider, model);
  if (!price) return 0;
  const cacheRead = price.cacheRead ?? price.input * 0.1;
  const cacheWrite = price.cacheWrite ?? price.input * 1.25;
  return Math.round(
    price.input * (usage.inputTokens ?? 0) +
      price.output * (usage.outputTokens ?? 0) +
      cacheRead * (usage.cacheReadTokens ?? 0) +
      cacheWrite * (usage.cacheWriteTokens ?? 0),
  );
}

/** Estimated cost of a unit-billed call in micro-USD (0 when unknown). */
export function unitCostMicros(provider: string, model: string, units: number): number {
  const price = UNIT_PRICES[`${provider}:${normalizeModel(model)}`];
  if (!price) return 0;
  return Math.round(price.usdPerUnit * units * 1_000_000);
}
