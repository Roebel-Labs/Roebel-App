// Writes one row per paid AI call into public.ai_usage_events (service role).
// Never throws and never blocks the caller for long: a failed or slow insert
// only costs us a ledger row, never a user request.
//
// No `server-only` / next/* imports so modules that are unit-tested with
// `npx tsx --test` can depend on it; without SUPABASE_SERVICE_ROLE_KEY it is a no-op.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeModel, tokenCostMicros, unitCostMicros, type TokenUsage } from "./pricing";

export type AiUsageSource = "web" | "expo" | "edge";

export interface AiUsageInput extends TokenUsage {
  source?: AiUsageSource;
  /** Dotted feature key, e.g. "mecky.chat", "newsletter.draft". */
  feature: string;
  provider: string;
  model: string;
  units?: number;
  unitType?: string;
  /** Overrides the price-table estimate (e.g. a cost the provider reported). */
  costMicros?: number;
  meta?: Record<string, unknown>;
}

const INSERT_TIMEOUT_MS = 3000;
let client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function estimateCostMicros(e: AiUsageInput): number {
  if (e.costMicros != null) return Math.max(0, Math.round(e.costMicros));
  return tokenCostMicros(e.provider, e.model, e) + unitCostMicros(e.provider, e.model, e.units ?? 0);
}

export async function recordAiUsage(e: AiUsageInput): Promise<void> {
  try {
    const supabase = db();
    if (!supabase) return;
    const row = {
      source: e.source ?? "web",
      feature: e.feature,
      provider: e.provider,
      model: normalizeModel(e.model),
      // Cached tokens count as input volume; their (cheaper) price is in cost_micros.
      input_tokens: (e.inputTokens ?? 0) + (e.cacheReadTokens ?? 0) + (e.cacheWriteTokens ?? 0),
      output_tokens: e.outputTokens ?? 0,
      units: e.units ?? 0,
      unit_type: e.unitType ?? null,
      cost_micros: estimateCostMicros(e),
      meta: e.meta ?? null,
    };
    const insert = supabase
      .from("ai_usage_events")
      .insert(row)
      .then(({ error }) => {
        if (error) console.warn("[ai-usage] insert failed:", error.message);
      });
    await Promise.race([insert, new Promise((r) => setTimeout(r, INSERT_TIMEOUT_MS))]);
  } catch (err) {
    console.warn("[ai-usage] record failed:", err instanceof Error ? err.message : err);
  }
}

/** The `usage` block of an OpenAI /v1/audio/transcriptions JSON response. */
export type TranscriptionUsage =
  | { type: "tokens"; input_tokens?: number; output_tokens?: number }
  | { type: "duration"; seconds?: number };

/** Book a transcription: token-billed (gpt-4o*-transcribe) or minute-billed (whisper-1). */
export function recordTranscriptionUsage(
  feature: string,
  model: string,
  usage: TranscriptionUsage | null | undefined,
  source: AiUsageSource = "web",
): Promise<void> {
  if (usage?.type === "tokens") {
    return recordAiUsage({
      source,
      feature,
      provider: "openai",
      model,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    });
  }
  return recordAiUsage({
    source,
    feature,
    provider: "openai",
    model,
    units: usage?.type === "duration" ? (usage.seconds ?? 0) : 0,
    unitType: "second",
  });
}
