import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, type UsageRow } from "./aggregate";
import { tokenCostMicros, unitCostMicros } from "./pricing";

function row(at: string, provider: string, usd: number, feature = "f"): UsageRow {
  return { at, source: "web", feature, provider, model: "m", inputTokens: 10, outputTokens: 5, units: 0, unitType: null, usd };
}

test("pricing: token and unit costs in micro-USD, date suffix stripped", () => {
  // 1M input at $1 + 1M output at $5 = $6
  assert.equal(tokenCostMicros("anthropic", "claude-haiku-4-5-20251001", { inputTokens: 1e6, outputTokens: 1e6 }), 6_000_000);
  // cache reads at 10 % of the input price
  assert.equal(tokenCostMicros("anthropic", "claude-opus-5", { cacheReadTokens: 1e6 }), 500_000);
  assert.equal(tokenCostMicros("anthropic", "unknown-model", { inputTokens: 1e6 }), 0);
  assert.equal(unitCostMicros("kie", "nano-banana-2-lite", 3), 60_000);
  assert.equal(unitCostMicros("elevenlabs", "eleven_multilingual_v2", 1000), 300_000);
});

test("summarize: range filter, daily buckets, burn projections", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const rows = [
    row("2026-10-15T08:00:00Z", "anthropic", 2, "mecky.chat"),
    row("2026-10-14T08:00:00Z", "openai", 1, "poster.image"),
    row("2026-10-01T08:00:00Z", "kie", 4, "menu.image"), // month-to-date, outside a 7-day range
    row("2026-09-20T08:00:00Z", "anthropic", 100), // older than everything
  ];
  const s = summarize(rows, 7, now);
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily[6].date, "2026-10-15");
  assert.equal(s.daily[6].anthropic, 2);
  assert.equal(s.daily[5].openai, 1);
  assert.equal(s.totals.usd, 3);
  assert.equal(s.totals.calls, 2);
  assert.equal(s.burn.monthToDateUsd, 7);
  assert.equal(s.burn.last7dDailyAvgUsd, 3 / 7);
  assert.ok(Math.abs(s.burn.monthlyRunRateUsd - (3 / 7) * 30.44) < 1e-9);
  // 7 $ over 14.5 elapsed days, projected to 31 days
  assert.ok(Math.abs(s.burn.projectedMonthUsd - (7 / 14.5) * 31) < 1e-9);
  assert.deepEqual(s.byFeature.map((f) => f.key), ["mecky.chat", "poster.image"]);
  assert.equal(s.bySource[0].source, "web");
});
