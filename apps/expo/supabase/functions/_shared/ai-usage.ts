// Books one paid AI call into public.ai_usage_events (KI-Kosten page in the web
// admin dashboard). Deno port of apps/web/src/lib/ai-usage/{pricing,record}.ts
// — keep the prices in sync with that file. Never throws.

/** $ per 1M tokens (1 $/MTok = 1 micro-$ per token). */
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  'anthropic:claude-haiku-4-5': { input: 1, output: 5 },
  'anthropic:claude-sonnet-4-6': { input: 3, output: 15 },
  'anthropic:claude-sonnet-5': { input: 2, output: 10 },
  'anthropic:claude-opus-4-8': { input: 5, output: 25 },
  'anthropic:claude-opus-5': { input: 5, output: 25 },
  'anthropic:claude-opus-5-5': { input: 4, output: 20 },
  'openai:gpt-4o-mini-transcribe': { input: 3, output: 5 },
};

/** $ per unit (image, search, …). */
const UNIT_PRICES: Record<string, number> = {
  'kie:nano-banana-2-lite': 0.02,
  'kie:nano-banana-2': 0.04,
  'kie:nano-banana-pro': 0.09,
  'kie:seedream/4.5-text-to-image': 0.025,
  'kie:seedream/4.5-edit': 0.025,
  'anthropic:web_search': 0.01,
};

export interface AiUsageRow {
  feature: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  units?: number;
  unitType?: string;
  meta?: Record<string, unknown>;
}

/** Anthropic Messages `usage` block → token fields. */
export function anthropicUsage(usage: Record<string, number> | null | undefined) {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

function costMicros(r: AiUsageRow): number {
  const model = r.model.replace(/-\d{8}$/, '');
  const key = `${r.provider}:${model}`;
  const t = TOKEN_PRICES[key];
  let micros = 0;
  if (t) {
    micros +=
      t.input * (r.inputTokens ?? 0) +
      t.output * (r.outputTokens ?? 0) +
      t.input * 0.1 * (r.cacheReadTokens ?? 0) +
      t.input * 1.25 * (r.cacheWriteTokens ?? 0);
  }
  const u = UNIT_PRICES[key];
  if (u) micros += u * (r.units ?? 0) * 1_000_000;
  return Math.round(micros);
}

export async function recordAiUsage(r: AiUsageRow): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return;
    const res = await fetch(`${url}/rest/v1/ai_usage_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        source: 'edge',
        feature: r.feature,
        provider: r.provider,
        model: r.model.replace(/-\d{8}$/, ''),
        input_tokens: (r.inputTokens ?? 0) + (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0),
        output_tokens: r.outputTokens ?? 0,
        units: r.units ?? 0,
        unit_type: r.unitType ?? null,
        cost_micros: costMicros(r),
        meta: r.meta ?? null,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.warn('[ai-usage] insert failed', res.status, await res.text().catch(() => ''));
  } catch (err) {
    console.warn('[ai-usage] record failed', err instanceof Error ? err.message : err);
  }
}
