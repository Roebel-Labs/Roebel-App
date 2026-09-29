import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { __resetDayMemo, __resetRateCache, getCurrentUsdEurRate, getDayRates, type DayRateStore, type FetchLike } from "./rates";

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Fake fetch: first matching prefix wins; records every URL asked. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
	const calls: string[] = [];
	const f: FetchLike = async (url) => {
		calls.push(url);
		for (const [prefix, fn] of Object.entries(routes)) if (url.startsWith(prefix)) return fn();
		throw new Error(`unrouted ${url}`);
	};
	return { f, calls };
}

beforeEach(() => {
	__resetRateCache();
	__resetDayMemo();
});

test("current rate: frankfurter first", async () => {
	const { f, calls } = fakeFetch({
		"https://api.frankfurter.app/latest": () => json({ rates: { EUR: 0.8807 } }),
	});
	assert.deepEqual(await getCurrentUsdEurRate({ fetchImpl: f }), { rate: 0.8807, source: "frankfurter" });
	assert.equal(calls.length, 1);
});

test("current rate: frankfurter down → open.er-api → coingecko, in that order", async () => {
	const { f, calls } = fakeFetch({
		"https://api.frankfurter.app/": () => json({}, 503),
		"https://open.er-api.com/": () => json({ result: "error" }),
		"https://api.coingecko.com/": () => json({ xdai: { eur: 0.879 } }),
	});
	assert.deepEqual(await getCurrentUsdEurRate({ fetchImpl: f }), { rate: 0.879, source: "coingecko" });
	assert.deepEqual(
		calls.map((u) => new URL(u).host),
		["api.frankfurter.app", "open.er-api.com", "api.coingecko.com"],
	);
});

test("current rate: insane values are rejected, never a constant", async () => {
	const { f } = fakeFetch({
		"https://api.frankfurter.app/": () => json({ rates: { EUR: 42 } }),
		"https://open.er-api.com/": () => json({ rates: { EUR: 0.881 } }),
	});
	assert.deepEqual(await getCurrentUsdEurRate({ fetchImpl: f }), { rate: 0.881, source: "open.er-api" });
});

test("current rate: all down → last good rate, labelled cached", async () => {
	const ok = fakeFetch({ "https://api.frankfurter.app/": () => json({ rates: { EUR: 0.88 } }) });
	await getCurrentUsdEurRate({ fetchImpl: ok.f, now: () => Date.parse("2026-09-29T10:00:00Z") });
	const down = fakeFetch({});
	const r = await getCurrentUsdEurRate({ fetchImpl: down.f });
	assert.equal(r?.rate, 0.88);
	assert.equal(r?.source, "cached:frankfurter@2026-09-29T10:00:00.000Z");
});

test("current rate: all down, cold process → newest persisted day, else null", async () => {
	const down = fakeFetch({});
	const r = await getCurrentUsdEurRate({ fetchImpl: down.f, fallbackLatest: async () => ({ rate: 0.877, day: "2026-09-26" }) });
	assert.deepEqual(r, { rate: 0.877, source: "cached:treasury_eur_rates@2026-09-26" });
	assert.equal(await getCurrentUsdEurRate({ fetchImpl: down.f }), null);
});

test("day rates: store first, frankfurter for the rest, only past days persisted", async () => {
	const puts: unknown[] = [];
	const store: DayRateStore = {
		get: async (days) => new Map(days.filter((d) => d === "2026-09-01").map((d) => [d, 0.9])),
		put: async (rows) => void puts.push(...rows),
		latest: async () => null,
	};
	const { f, calls } = fakeFetch({
		"https://api.frankfurter.app/2026-09-27": () => json({ date: "2026-09-25", rates: { EUR: 0.877 } }),
	});
	const { rates, missing } = await getDayRates(["2026-09-01", "2026-09-27", "2026-09-29", "2026-09-27"], {
		store,
		fetchImpl: f,
		currentRate: 0.88,
		today: "2026-09-29",
	});
	assert.equal(rates.get("2026-09-01"), 0.9);
	assert.equal(rates.get("2026-09-27"), 0.877);
	assert.equal(rates.get("2026-09-29"), 0.88, "today = current rate, not fetched");
	assert.deepEqual(missing, []);
	assert.equal(calls.length, 1, "one fetch per missing past day, deduplicated");
	assert.deepEqual(puts, [{ day: "2026-09-27", usd_eur: 0.877, source: "frankfurter:2026-09-25" }]);
});

test("day rates: unreachable day falls back to the current rate and is reported", async () => {
	const { f } = fakeFetch({});
	const { rates, missing } = await getDayRates(["2026-08-01"], { fetchImpl: f, currentRate: 0.88, today: "2026-09-29" });
	assert.equal(rates.get("2026-08-01"), 0.88);
	assert.deepEqual(missing, ["2026-08-01"]);
});
