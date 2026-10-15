// Authoritative spend straight from the providers' billing APIs. Optional:
// each source is only queried when its ADMIN key is set (regular API keys are
// rejected by these endpoints).
//   ANTHROPIC_ADMIN_KEY (sk-ant-admin…) → GET /v1/organizations/cost_report
//   OPENAI_ADMIN_KEY                    → GET /v1/organization/costs
// Both are daily-bucketed in UTC. Server-only.
import "server-only";

export interface BillingDay {
  date: string; // YYYY-MM-DD (UTC)
  usd: number;
}

export interface BillingReport {
  provider: "anthropic" | "openai";
  configured: boolean;
  ok: boolean;
  error?: string;
  totalUsd: number;
  daily: BillingDay[];
  /** Spend by provider line item (model / service), largest first. */
  lineItems: { name: string; usd: number }[];
}

const MAX_PAGES = 10;
const TIMEOUT_MS = 15_000;

function finish(
  provider: BillingReport["provider"],
  byDay: Map<string, number>,
  byItem: Map<string, number>,
): BillingReport {
  const daily = [...byDay.entries()].map(([date, usd]) => ({ date, usd })).sort((a, b) => a.date.localeCompare(b.date));
  const lineItems = [...byItem.entries()].map(([name, usd]) => ({ name, usd })).sort((a, b) => b.usd - a.usd);
  return {
    provider,
    configured: true,
    ok: true,
    totalUsd: daily.reduce((s, d) => s + d.usd, 0),
    daily,
    lineItems,
  };
}

function failed(provider: BillingReport["provider"], error: unknown): BillingReport {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ai-usage/billing] ${provider}:`, message);
  return { provider, configured: true, ok: false, error: message, totalUsd: 0, daily: [], lineItems: [] };
}

function notConfigured(provider: BillingReport["provider"]): BillingReport {
  return { provider, configured: false, ok: false, totalUsd: 0, daily: [], lineItems: [] };
}

interface AnthropicCostPage {
  data?: {
    starting_at: string;
    results?: { amount?: string; description?: string | null; model?: string | null; cost_type?: string | null }[];
  }[];
  has_more?: boolean;
  next_page?: string | null;
}

/** Anthropic cost report. `amount` is a decimal string in cents. */
export async function fetchAnthropicCosts(since: Date): Promise<BillingReport> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return notConfigured("anthropic");
  try {
    const byDay = new Map<string, number>();
    const byItem = new Map<string, number>();
    let page: string | null = null;
    for (let i = 0; i < MAX_PAGES; i++) {
      const qs = new URLSearchParams({
        starting_at: since.toISOString(),
        ending_at: new Date().toISOString(),
        bucket_width: "1d",
        limit: "31",
      });
      qs.append("group_by[]", "description");
      if (page) qs.set("page", page);
      const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${qs}`, {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as AnthropicCostPage;
      for (const bucket of json.data ?? []) {
        const date = bucket.starting_at.slice(0, 10);
        for (const r of bucket.results ?? []) {
          const usd = Number(r.amount ?? 0) / 100;
          if (!Number.isFinite(usd)) continue;
          byDay.set(date, (byDay.get(date) ?? 0) + usd);
          const item = r.model || r.description || r.cost_type || "Sonstiges";
          byItem.set(item, (byItem.get(item) ?? 0) + usd);
        }
      }
      if (!json.has_more || !json.next_page) break;
      page = json.next_page;
    }
    return finish("anthropic", byDay, byItem);
  } catch (e) {
    return failed("anthropic", e);
  }
}

interface OpenAiCostPage {
  data?: {
    start_time: number;
    results?: { amount?: { value?: number }; line_item?: string | null }[];
  }[];
  has_more?: boolean;
  next_page?: string | null;
}

/** OpenAI organization costs. `amount.value` is in dollars. */
export async function fetchOpenAiCosts(since: Date): Promise<BillingReport> {
  const key = process.env.OPENAI_ADMIN_KEY;
  if (!key) return notConfigured("openai");
  try {
    const byDay = new Map<string, number>();
    const byItem = new Map<string, number>();
    let page: string | null = null;
    for (let i = 0; i < MAX_PAGES; i++) {
      const qs = new URLSearchParams({
        start_time: String(Math.floor(since.getTime() / 1000)),
        bucket_width: "1d",
        limit: "31",
      });
      qs.append("group_by[]", "line_item");
      if (page) qs.set("page", page);
      const res = await fetch(`https://api.openai.com/v1/organization/costs?${qs}`, {
        headers: { authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as OpenAiCostPage;
      for (const bucket of json.data ?? []) {
        const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
        for (const r of bucket.results ?? []) {
          const usd = Number(r.amount?.value ?? 0);
          if (!Number.isFinite(usd)) continue;
          byDay.set(date, (byDay.get(date) ?? 0) + usd);
          const item = r.line_item || "Sonstiges";
          byItem.set(item, (byItem.get(item) ?? 0) + usd);
        }
      }
      if (!json.has_more || !json.next_page) break;
      page = json.next_page;
    }
    return finish("openai", byDay, byItem);
  } catch (e) {
    return failed("openai", e);
  }
}
