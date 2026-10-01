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
		if (parsed) {
			await rememberRate(parsed.rate);
			if (!isDegradedTreasury(parsed)) await cacheTreasury(parsed);
		}
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

// ── Fast first paint: on-device cache → Supabase snapshot → route ───────────
//
// The web route upserts every complete (non-degraded) answer into the
// single-row table `public.treasury_snapshot` (payload = the route's JSON).
// One Supabase select answers in ~100 ms where the route may have to read the
// chain + Blockscout first, so screens render the snapshot right away and
// replace it once the route answers. The last good payload is also kept in
// AsyncStorage, so a cold start renders instantly — even offline.

/** The Supabase read is a fast path only: give up quickly. */
export const TREASURY_SNAPSHOT_TIMEOUT_MS = 3000;
const PAYLOAD_KEY = "treasury:last-payload:v1";

/** A degraded route answer (no history / a remembered rate) — never cached,
 *  and never replaces a complete answer already on screen. */
export function isDegradedTreasury(p: TreasuryApiResponse): boolean {
	return !p.historyAvailable || p.rateSource.startsWith("cached:");
}

/** Reads `treasury_snapshot.payload` (the route's JSON) or null. */
export type TreasurySnapshotReader = () => Promise<unknown | null>;

const defaultSnapshotReader: TreasurySnapshotReader = async () => {
	// Lazy: keeps this module free of the Supabase client for its other users.
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { supabase } = require("@/lib/supabase");
	const { data, error } = await supabase.from("treasury_snapshot").select("payload").eq("id", 1).maybeSingle();
	// A missing table (migration not applied yet) is just "no snapshot".
	if (error || !data) return null;
	return (data as { payload?: unknown }).payload ?? null;
};

/** The Supabase snapshot, or null (missing table / row, offline, slow, malformed). */
export async function fetchTreasurySnapshot(
	opts: { reader?: TreasurySnapshotReader; timeoutMs?: number } = {},
): Promise<TreasuryApiResponse | null> {
	const reader = opts.reader ?? defaultSnapshotReader;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const payload = await Promise.race([
			reader(),
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), opts.timeoutMs ?? TREASURY_SNAPSHOT_TIMEOUT_MS);
			}),
		]);
		return payload ? parseTreasuryApi(payload) : null;
	} catch {
		return null;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export async function cacheTreasury(p: TreasuryApiResponse): Promise<void> {
	try {
		await AsyncStorage.setItem(PAYLOAD_KEY, JSON.stringify(p));
	} catch {
		/* storage unavailable */
	}
}

/** The last good payload on this device, or null. */
export async function readCachedTreasury(): Promise<TreasuryApiResponse | null> {
	try {
		const raw = await AsyncStorage.getItem(PAYLOAD_KEY);
		return raw ? parseTreasuryApi(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

/** Same figure + same history (asOf / rate metadata ignored). */
export function sameTreasury(a: TreasuryApiResponse, b: TreasuryApiResponse): boolean {
	return (
		a.euroTotal === b.euroTotal &&
		a.xdai === b.xdai &&
		a.eure === b.eure &&
		a.historyAvailable === b.historyAvailable &&
		JSON.stringify(a.history) === JSON.stringify(b.history)
	);
}

export type TreasurySource = "cache" | "snapshot" | "route";

/**
 * Snapshot-first treasury load. Calls `onUpdate` with the cached payload (if
 * any), then the Supabase snapshot, then the route's answer — each only when
 * it changes what is on screen. Resolves with the last payload shown, or null
 * when none of the three had one (= use the on-device fallbacks).
 *
 * Rules: an older snapshot never replaces a newer cache; the snapshot is
 * skipped once the route answered; a degraded route answer never replaces a
 * complete payload.
 */
export async function loadTreasuryProgressive(
	onUpdate: (p: TreasuryApiResponse, source: TreasurySource) => void,
	opts: { reader?: TreasurySnapshotReader; fetchImpl?: FetchLike; snapshotTimeoutMs?: number; timeoutMs?: number } = {},
): Promise<TreasuryApiResponse | null> {
	let shown: TreasuryApiResponse | null = null;
	const show = (p: TreasuryApiResponse, source: TreasurySource) => {
		if (shown && sameTreasury(shown, p)) {
			shown = p;
			return;
		}
		shown = p;
		onUpdate(p, source);
	};

	let routeAnswered = false;
	const routeP = fetchTreasuryApi({ fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs }).then((r) => {
		if (r) routeAnswered = true;
		return r;
	});

	const cached = await readCachedTreasury();
	if (cached && !routeAnswered) show(cached, "cache");

	const snap = await fetchTreasurySnapshot({ reader: opts.reader, timeoutMs: opts.snapshotTimeoutMs });
	if (snap && !routeAnswered && (!cached || snap.asOf >= cached.asOf)) {
		show(snap, "snapshot");
		if (!isDegradedTreasury(snap)) await cacheTreasury(snap);
	}

	const route = await routeP;
	if (route && !(isDegradedTreasury(route) && shown && !isDegradedTreasury(shown))) {
		show(route, "route");
	}
	return shown;
}
