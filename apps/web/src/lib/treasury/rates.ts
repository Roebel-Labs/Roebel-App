// USD→EUR rates for the Gemeinschaftskasse. xDAI is pegged to the US dollar,
// so its euro value is the USD→EUR rate. ECB-based sources come first; there
// is deliberately NO hard-coded constant anywhere: when every source fails the
// last good rate is reused and `source` says so.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface RateResult {
	rate: number;
	/** Which source produced the rate, e.g. "frankfurter" or "cached:frankfurter@2026-09-29T10:00:00.000Z". */
	source: string;
}

/** A USD→EUR rate outside this band is a broken response, not a market move. */
export function isSaneRate(rate: unknown): rate is number {
	return typeof rate === "number" && Number.isFinite(rate) && rate > 0.5 && rate < 2;
}

export const CURRENT_RATE_SOURCES: ReadonlyArray<{
	name: string;
	url: string;
	pick: (json: any) => unknown;
}> = [
	{
		name: "frankfurter",
		url: "https://api.frankfurter.app/latest?from=USD&to=EUR",
		pick: (j) => Number(j?.rates?.EUR),
	},
	{
		name: "open.er-api",
		url: "https://open.er-api.com/v6/latest/USD",
		pick: (j) => Number(j?.rates?.EUR),
	},
	{
		name: "coingecko",
		url: "https://api.coingecko.com/api/v3/simple/price?ids=xdai&vs_currencies=eur",
		pick: (j) => Number(j?.xdai?.eur),
	},
];

/** JSON GET with a hard timeout; redirects are followed (frankfurter.app 301s to .dev). */
export async function fetchJsonWithTimeout(
	fetchImpl: FetchLike,
	url: string,
	timeoutMs: number,
	init?: RequestInit,
): Promise<any> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetchImpl(url, { redirect: "follow", ...init, signal: controller.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}

let lastGood: { rate: number; source: string; at: number } | null = null;

/** Test hook. */
export function __resetRateCache(value: { rate: number; source: string; at: number } | null = null) {
	lastGood = value;
}

/**
 * Current USD→EUR rate: frankfurter (ECB) → open.er-api → CoinGecko xDAI.
 * All fail → the last good rate of this process (source "cached:…"), then
 * `fallbackLatest` (e.g. the newest persisted day rate). null = unknowable.
 */
export async function getCurrentUsdEurRate(opts: {
	fetchImpl?: FetchLike;
	timeoutMs?: number;
	fallbackLatest?: () => Promise<{ rate: number; day: string } | null>;
	now?: () => number;
} = {}): Promise<RateResult | null> {
	const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
	const timeoutMs = opts.timeoutMs ?? 6000;
	const now = opts.now ?? Date.now;
	for (const src of CURRENT_RATE_SOURCES) {
		try {
			const rate = src.pick(await fetchJsonWithTimeout(fetchImpl, src.url, timeoutMs));
			if (isSaneRate(rate)) {
				lastGood = { rate, source: src.name, at: now() };
				return { rate, source: src.name };
			}
		} catch {
			/* next source */
		}
	}
	if (lastGood) {
		return { rate: lastGood.rate, source: `cached:${lastGood.source}@${new Date(lastGood.at).toISOString()}` };
	}
	if (opts.fallbackLatest) {
		try {
			const latest = await opts.fallbackLatest();
			if (latest && isSaneRate(latest.rate)) {
				return { rate: latest.rate, source: `cached:treasury_eur_rates@${latest.day}` };
			}
		} catch {
			/* nothing left */
		}
	}
	return null;
}

/** Persistent per-day store (Supabase `treasury_eur_rates`). Every method must swallow its own errors. */
export interface DayRateStore {
	get(days: string[]): Promise<Map<string, number>>;
	put(rows: { day: string; usd_eur: number; source: string }[]): Promise<void>;
	latest(): Promise<{ rate: number; day: string } | null>;
}

/** UTC calendar day of an epoch-ms timestamp, YYYY-MM-DD. */
export function utcDay(tsMs: number): string {
	return new Date(tsMs).toISOString().slice(0, 10);
}

const dayMemo = new Map<string, number>();
/** Test hook. */
export function __resetDayMemo() {
	dayMemo.clear();
}

/**
 * USD→EUR rate per UTC day. Order: in-process memo → the store → frankfurter's
 * historical endpoint (ECB has no weekend rates; frankfurter answers with the
 * previous business day, which is fine). Only days strictly before today are
 * persisted (today's ECB fixing may not be out yet). A day no source can price
 * is valued at `currentRate` and reported in `missing`.
 */
export async function getDayRates(
	days: string[],
	opts: {
		store?: DayRateStore | null;
		fetchImpl?: FetchLike;
		currentRate: number;
		today?: string;
		timeoutMs?: number;
	},
): Promise<{ rates: Map<string, number>; missing: string[] }> {
	const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
	const today = opts.today ?? utcDay(Date.now());
	const unique = [...new Set(days)];
	const rates = new Map<string, number>();

	let need = unique.filter((d) => {
		const hit = dayMemo.get(d);
		if (hit !== undefined) rates.set(d, hit);
		return hit === undefined;
	});

	if (need.length && opts.store) {
		const stored = await opts.store.get(need).catch(() => new Map<string, number>());
		for (const [d, r] of stored) {
			if (isSaneRate(r)) {
				rates.set(d, r);
				dayMemo.set(d, r);
			}
		}
		need = need.filter((d) => !rates.has(d));
	}

	const fresh: { day: string; usd_eur: number; source: string }[] = [];
	const missing: string[] = [];
	// Small concurrency: frankfurter is generous, but no need to burst it.
	const queue = [...need];
	const worker = async () => {
		for (let d = queue.shift(); d !== undefined; d = queue.shift()) {
			if (d >= today) {
				rates.set(d, opts.currentRate);
				continue;
			}
			try {
				const j = await fetchJsonWithTimeout(
					fetchImpl,
					`https://api.frankfurter.app/${d}?from=USD&to=EUR`,
					opts.timeoutMs ?? 6000,
				);
				const r = Number(j?.rates?.EUR);
				if (isSaneRate(r)) {
					rates.set(d, r);
					dayMemo.set(d, r);
					fresh.push({ day: d, usd_eur: r, source: `frankfurter:${String(j?.date ?? d)}` });
					continue;
				}
			} catch {
				/* fall through */
			}
			rates.set(d, opts.currentRate);
			missing.push(d);
		}
	};
	await Promise.all([worker(), worker(), worker(), worker()]);

	if (fresh.length && opts.store) await opts.store.put(fresh).catch(() => {});
	return { rates, missing };
}
