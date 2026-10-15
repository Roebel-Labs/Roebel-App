// GET /api/ki-kosten?range=7d|30d|90d — admin-only. AI burn rate for the
// KI-Kosten dashboard page: our own ledger (ai_usage_events + chat_runs +
// event_poster_proposals) plus, when admin keys are set, the providers' billing.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin, isFresh, getParam, jsonError } from "@/lib/muenzen/api";
import { cached, TTL } from "@/lib/muenzen/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarize, type UsageRow } from "@/lib/ai-usage/aggregate";
import { fetchAnthropicCosts, fetchOpenAiCosts } from "@/lib/ai-usage/billing";
import { MODEL_ROUTES, isModelRoute } from "@/lib/chat/models";
import type { ModelRoute } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
const PAGE = 1000;
const MAX_ROWS = 100_000;
const DAY_MS = 86_400_000;

/** Page through a table; PostgREST caps a single select at 1000 rows. */
async function selectAll<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  since: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function loadRows(since: string): Promise<{ rows: UsageRow[]; trackedSince: string | null }> {
  const db = createAdminClient();
  const [events, chat, posters, first] = await Promise.all([
    selectAll<any>(
      db,
      "ai_usage_events",
      "created_at, source, feature, provider, model, input_tokens, output_tokens, units, unit_type, cost_micros",
      since,
    ),
    selectAll<any>(db, "chat_runs", "created_at, route, input_tokens, output_tokens, cost_micros", since),
    selectAll<any>(db, "event_poster_proposals", "created_at, model, cost_usd", since),
    db.from("ai_usage_events").select("created_at").order("created_at", { ascending: true }).limit(1),
  ]);

  const rows: UsageRow[] = [
    ...events.map((e) => ({
      at: e.created_at,
      source: e.source,
      feature: e.feature,
      provider: e.provider,
      model: e.model,
      inputTokens: e.input_tokens ?? 0,
      outputTokens: e.output_tokens ?? 0,
      units: Number(e.units ?? 0),
      unitType: e.unit_type,
      usd: Number(e.cost_micros ?? 0) / 1e6,
    })),
    // Chat suite (Mecky Chat threads, bots, routines) keeps its own ledger.
    ...chat.map((c) => ({
      at: c.created_at,
      source: "expo" as const,
      feature: `chat.${c.route ?? "bot"}`,
      provider: "anthropic",
      model: isModelRoute(c.route) ? MODEL_ROUTES[c.route as ModelRoute].anthropic.replace(/-\d{8}$/, "") : String(c.route ?? "unbekannt"),
      inputTokens: c.input_tokens ?? 0,
      outputTokens: c.output_tokens ?? 0,
      units: 0,
      unitType: null,
      usd: Number(c.cost_micros ?? 0) / 1e6,
    })),
    // Event poster images (OpenAI Images) keep their cost on the proposal row.
    ...posters.map((p) => ({
      at: p.created_at,
      source: "web" as const,
      feature: "poster.image",
      provider: "openai",
      model: p.model,
      inputTokens: 0,
      outputTokens: 0,
      units: 1,
      unitType: "image",
      usd: Number(p.cost_usd ?? 0),
    })),
  ];
  return { rows, trackedSince: first.data?.[0]?.created_at ?? null };
}

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rangeKey = getParam(req, "range") ?? "30d";
  const rangeDays = RANGES[rangeKey] ?? 30;

  try {
    const data = await cached(
      `ki-kosten:${rangeDays}`,
      TTL.chain,
      async () => {
        const now = new Date();
        const rangeStart = new Date(now.getTime() - rangeDays * DAY_MS);
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        // Load enough history for both the range and month-to-date.
        const since = new Date(Math.min(rangeStart.getTime(), monthStart.getTime()));
        const [{ rows, trackedSince }, anthropic, openai] = await Promise.all([
          loadRows(since.toISOString()),
          fetchAnthropicCosts(rangeStart),
          fetchOpenAiCosts(rangeStart),
        ]);
        return {
          range: rangeKey,
          ...summarize(rows, rangeDays, now),
          billing: [anthropic, openai],
          trackedSince,
          generatedAt: Date.now(),
        };
      },
      isFresh(req),
    );
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e);
  }
}
