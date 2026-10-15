// Named model routes (spec §3.2). Every model call in the chat suite goes
// through a route name so the backend can flip to a self-hosted gateway
// (LiteLLM → vLLM) without an app release: when LLM_GATEWAY_URL is set, every
// route resolves through @ai-sdk/openai-compatible with the route name as the
// model id (LiteLLM aliases).
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ModelRoute } from "./types";
import { tokenCostMicros } from "../ai-usage/pricing";

export const MODEL_ROUTES: Record<ModelRoute, { anthropic: string }> = {
  "bot-fast": { anthropic: "claude-haiku-4-5-20251001" },
  "bot-smart": { anthropic: "claude-sonnet-5" },
  vision: { anthropic: "claude-sonnet-5" },
};

export const STT_MODEL = "gpt-4o-mini-transcribe";

export function isModelRoute(route: unknown): route is ModelRoute {
  return typeof route === "string" && route in MODEL_ROUTES;
}

export function normalizeRoute(route: unknown): ModelRoute {
  return isModelRoute(route) ? route : "bot-smart";
}

export interface ResolvedModel {
  route: ModelRoute;
  provider: "anthropic" | "gateway";
  modelId: string;
  model: LanguageModel;
}

export function gatewayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.LLM_GATEWAY_URL && env.LLM_GATEWAY_KEY);
}

let gatewayProvider: ReturnType<typeof createOpenAICompatible> | null = null;

export function resolveModel(routeInput: unknown, env: NodeJS.ProcessEnv = process.env): ResolvedModel {
  const route = normalizeRoute(routeInput);
  if (gatewayConfigured(env)) {
    gatewayProvider ??= createOpenAICompatible({
      name: "llm-gateway",
      baseURL: env.LLM_GATEWAY_URL!,
      apiKey: env.LLM_GATEWAY_KEY!,
      includeUsage: true,
    });
    return { route, provider: "gateway", modelId: route, model: gatewayProvider.chatModel(route) };
  }
  const modelId = MODEL_ROUTES[route].anthropic;
  return { route, provider: "anthropic", modelId, model: anthropic(modelId) };
}

/** Rough cost in micro-USD (chat_runs.cost_micros), from the shared price table. Gateway (self-hosted) runs count as 0. */
export function estimateCostMicros(modelId: string, inputTokens: number, outputTokens: number): number {
  return tokenCostMicros("anthropic", modelId, { inputTokens, outputTokens });
}
