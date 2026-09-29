// Client for GET {web}/api/treasury — the ONE server-side source of the
// Gemeinschaftskasse € figure and its (already curated, balanced) history.
// Every app surface (treasury screen, rewards card, TreasuryCard, proposal
// page, composer snapshot) reads through lib/roebel-taler.ts, which asks this
// helper first and only computes on-device when the route is unreachable.
//
// It also remembers the last good USD→EUR rate (AsyncStorage), so the
// on-device fallback never has to invent a rate: no rate at all means the
// dated snapshot, never a guessed number.
import AsyncStorage from "@react-native-async-storage/async-storage";

// Same resolution as lib/signed-request.ts getApiBaseUrl(): production must hit
// the www host directly (the apex answers with a 307).
const DEFAULT_API_BASE_URL = "https://www.roebel.app";
export function treasuryApiBase(): string {
	const env = process.env.EXPO_PUBLIC_API_BASE_URL;
	return env && env.length > 0 ? env.replace(/\/$/, "") : DEFAULT_API_BASE_URL;
}

export const TREASURY_API_TIMEOUT_MS = 8000;
/** Reuse one answer across the surfaces of one screen visit. */
const MEMO_MS = 60_000;

export interface TreasuryApiLink {
	type: "proposal" | "post";
	/** Route id for `/proposal/[id]` or `/post/[id]`. */
	id: string;
	title: string;
}

export interface TreasuryApiRow {
	txHash: string;
	direction: "in" | "out";
	euro: number;
	timestamp: number;
	label: string;
	link: TreasuryApiLink | null;
}

export interface TreasuryApiResponse {
	euroTotal: number;
	xdai: number;
	eure: number;
	rate: number;
	rateSource: string;
	asOf: string;
	history: TreasuryApiRow[];
	historyAvailable: boolean;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseLink(v: any): TreasuryApiLink | null {
	if (!v || (v.type !== "proposal" && v.type !== "post")) return null;
	if (typeof v.id !== "string" || !v.id) return null;
	return { type: v.type, id: v.id, title: typeof v.title === "string" ? v.title : "" };
}

/** Validate the route's JSON; anything malformed → null (= use the fallback). */
export function parseTreasuryApi(json: any): TreasuryApiResponse | null {
	const euroTotal = num(json?.euroTotal);
	const xdai = num(json?.xdai);
	const eure = num(json?.eure);
	const rate = num(json?.rate);
	if (euroTotal === null || xdai === null || eure === null || rate === null) return null;
	if (!(rate > 0.5 && rate < 2)) return null;
	const history: TreasuryApiRow[] = [];
	for (const r of Array.isArray(json?.history) ? json.history : []) {
		const euro = num(r?.euro);
		if (euro === null || (r?.direction !== "in" && r?.direction !== "out")) continue;
		history.push({
			txHash: String(r?.txHash ?? ""),
			direction: r.direction,
			euro,
			timestamp: num(r?.timestamp) ?? 0,
			label: typeof r?.label === "string" && r.label ? r.label : r.direction === "in" ? "Eingang" : "Ausgang",
			link: parseLink(r?.link),
		});
	}
	return {
		euroTotal,
		xdai,
		eure,
		rate,
		rateSource: String(json?.rateSource ?? ""),
		asOf: String(json?.asOf ?? ""),
		history,
		historyAvailable: json?.historyAvailable !== false,
	};
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let memo: { at: number; promise: Promise<TreasuryApiResponse | null> } | null = null;

/** Test hook. */
export function __resetTreasuryApiMemo() {
	memo = null;
}

async function fetchOnce(fetchImpl: FetchLike, timeoutMs: number): Promise<TreasuryApiResponse | null> {
	// RN fetch has no timeout of its own: without the abort a dead host hangs forever.
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetchImpl(`${treasuryApiBase()}/api/treasury`, {
			headers: { Accept: "application/json" },
			signal: controller.signal,
		});
		// 404 = the route is not deployed yet (3.7.0 can ship before it); 503 = the
		// server could not read the chain. Both: use the on-device fallback.
		if (!res.ok) return null;
		const parsed = parseTreasuryApi(await res.json());
		if (parsed) await rememberRate(parsed.rate);
		return parsed;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * The treasury from the server, or null when the route is unreachable,
 * missing or malformed. Concurrent callers share one request; a success is
 * reused for a minute, a failure is not cached.
 */
export function fetchTreasuryApi(
	opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<TreasuryApiResponse | null> {
	if (memo && Date.now() - memo.at < MEMO_MS) return memo.promise;
	const promise = fetchOnce(opts.fetchImpl ?? fetch, opts.timeoutMs ?? TREASURY_API_TIMEOUT_MS);
	const entry = { at: Date.now(), promise };
	memo = entry;
	promise.then((v) => {
		if (v === null && memo === entry) memo = null;
	});
	return promise;
}

// ── last good USD→EUR rate (for the on-device fallback) ──────────────────────

const RATE_KEY = "treasury:last-usd-eur-rate:v1";
/** Older than this, a remembered rate is too stale to value the treasury. */
export const REMEMBERED_RATE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export async function rememberRate(rate: number): Promise<void> {
	if (!(rate > 0.5 && rate < 2)) return;
	try {
		await AsyncStorage.setItem(RATE_KEY, JSON.stringify({ rate, at: Date.now() }));
	} catch {
		/* storage unavailable: nothing to remember */
	}
}

/** The last good rate, or null (none yet / unreadable / older than two weeks). */
export async function readRememberedRate(now: number = Date.now()): Promise<number | null> {
	try {
		const raw = await AsyncStorage.getItem(RATE_KEY);
		if (!raw) return null;
		const v = JSON.parse(raw);
		const rate = Number(v?.rate);
		const at = Number(v?.at);
		if (!(rate > 0.5 && rate < 2) || !Number.isFinite(at)) return null;
		if (now - at > REMEMBERED_RATE_MAX_AGE_MS) return null;
		return rate;
	} catch {
		return null;
	}
}
