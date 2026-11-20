// Named model routes (spec §3.2). Every model call in the chat suite goes
// through a route name so the backend can flip to a self-hosted gateway
// (LiteLLM → vLLM) without an app release: when LLM_GATEWAY_URL is set, every
// route resolves through @ai-sdk/openai-compatible with the route name as the
// model id (LiteLLM aliases).
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ModelRoute } from "./types";
import { tokenCostMicros } from "../ai-usage/pricing";
import { getProviderKey } from "./provider-keys";

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
  /** 'own_key' = the user's own Anthropic key pays; cost 0 for the platform, no quota. */
  billedTo: "platform" | "own_key";
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
    return { route, provider: "gateway", modelId: route, model: gatewayProvider.chatModel(route), billedTo: "platform" };
  }
  const modelId = MODEL_ROUTES[route].anthropic;
  return { route, provider: "anthropic", modelId, model: anthropic(modelId), billedTo: "platform" };
}

/**
 * Like resolveModel, but a user who stored their own Anthropic key gets the same route on that key
 * (spec 2026-11-13 §4). The gateway still wins when configured (self-hosted = free anyway).
 */
export async function resolveModelFor(wallet: string, routeInput: unknown, env: NodeJS.ProcessEnv = process.env): Promise<ResolvedModel> {
  const base = resolveModel(routeInput, env);
  if (base.provider !== "anthropic") return base;
  let key: string | null = null;
  try {
    key = await getProviderKey(wallet, "anthropic");
  } catch (err) {
    console.error("[chat/models] own key lookup failed", err);
  }
  if (!key) return base;
  const own = createAnthropic({ apiKey: key });
  return { ...base, model: own(base.modelId), billedTo: "own_key" };
}

/** Cost the platform pays for this run (0 on the user's own key or a self-hosted gateway). */
export function platformCostMicros(resolved: ResolvedModel, inputTokens: number, outputTokens: number): number {
  return resolved.provider === "anthropic" && resolved.billedTo === "platform" ? estimateCostMicros(resolved.modelId, inputTokens, outputTokens) : 0;
}

/** Rough cost in micro-USD (chat_runs.cost_micros), from the shared price table. Gateway (self-hosted) runs count as 0. */
export function estimateCostMicros(modelId: string, inputTokens: number, outputTokens: number): number {
  return tokenCostMicros("anthropic", modelId, { inputTokens, outputTokens });
}
