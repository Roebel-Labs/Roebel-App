// AI SDK middleware that records every generate/stream call's token usage into
// ai_usage_events. Wrap the model at the call site and nothing else changes:
//
//   model: tracked(anthropic("claude-sonnet-4-6"), "newsletter.draft"),
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import { recordAiUsage, type AiUsageSource } from "./record";

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]["model"];
type V3Usage = {
  inputTokens: { total?: number; noCache?: number; cacheRead?: number; cacheWrite?: number };
  outputTokens: { total?: number };
  raw?: unknown;
};

/** "anthropic.messages" → "anthropic", "zai.chat" → "zai". */
function providerKey(provider: string): string {
  return provider.split(".")[0] || provider;
}

function webSearches(raw: unknown): number {
  const r = raw as { server_tool_use?: { web_search_requests?: number } } | null | undefined;
  return r?.server_tool_use?.web_search_requests ?? 0;
}

async function record(
  model: { provider: string; modelId: string },
  usage: V3Usage | undefined,
  feature: string,
  source: AiUsageSource,
): Promise<void> {
  if (!usage) return;
  const provider = providerKey(model.provider);
  const cacheRead = usage.inputTokens.cacheRead ?? 0;
  const cacheWrite = usage.inputTokens.cacheWrite ?? 0;
  const noCache = usage.inputTokens.noCache ?? Math.max(0, (usage.inputTokens.total ?? 0) - cacheRead - cacheWrite);
  await recordAiUsage({
    source,
    feature,
    provider,
    model: model.modelId,
    inputTokens: noCache,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: usage.outputTokens.total ?? 0,
  });
  const searches = provider === "anthropic" ? webSearches(usage.raw) : 0;
  if (searches > 0) {
    await recordAiUsage({ source, feature, provider, model: "web_search", units: searches, unitType: "search" });
  }
}

export function tracked<M extends WrappableModel>(
  model: M,
  feature: string,
  source: AiUsageSource = "web",
): WrappableModel {
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate, model: m }) => {
      const result = await doGenerate();
      await record(m, result.usage as V3Usage, feature, source);
      return result;
    },
    wrapStream: async ({ doStream, model: m }) => {
      const { stream, ...rest } = await doStream();
      let usage: V3Usage | undefined;
      const tap = new TransformStream<any, any>({
        transform(chunk, controller) {
          if (chunk?.type === "finish") usage = chunk.usage as V3Usage;
          controller.enqueue(chunk);
        },
        async flush() {
          await record(m, usage, feature, source);
        },
      });
      return { stream: stream.pipeThrough(tap), ...rest };
    },
  };
  return wrapLanguageModel({ model, middleware });
}
