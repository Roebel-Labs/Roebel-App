// Snapshot-first treasury load: on-device cache → Supabase `treasury_snapshot`
// → /api/treasury, each replacing the previous only when it differs.
jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	__resetTreasuryApiMemo,
	cacheTreasury,
	fetchTreasurySnapshot,
	loadTreasuryProgressive,
	parseTreasuryApi,
	readCachedTreasury,
	type TreasurySource,
} from "../treasury-api";

const payload = (euroTotal: number, asOf: string, extra: Record<string, unknown> = {}) => ({
	euroTotal,
	xdai: 452,
	eure: 0,
	rate: 0.88,
	rateSource: "frankfurter",
	asOf,
	historyAvailable: true,
	history: [
		{ txHash: "0x1", direction: "in", euro: euroTotal, timestamp: 1, label: "Eingang", link: { type: "proposal", id: "p1", title: "Bank" } },
	],
	...extra,
});

const response = (body: unknown, status = 200) =>
	({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const later = <T,>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));

function collect() {
	const calls: Array<{ euro: number; source: TreasurySource }> = [];
	return { calls, onUpdate: (p: { euroTotal: number }, source: TreasurySource) => calls.push({ euro: p.euroTotal, source }) };
}

beforeEach(async () => {
	__resetTreasuryApiMemo();
	await AsyncStorage.clear();
});

describe("treasury snapshot-first ordering", () => {
	it("renders the Supabase snapshot first, then the route when it differs", async () => {
		const { calls, onUpdate } = collect();
		const final = await loadTreasuryProgressive(onUpdate, {
			reader: async () => payload(390, "2026-10-01T08:00:00.000Z"),
			fetchImpl: () => later(response(payload(398.06, "2026-10-01T09:00:00.000Z")), 20),
		});
		expect(calls).toEqual([
			{ euro: 390, source: "snapshot" },
			{ euro: 398.06, source: "route" },
		]);
		expect(final?.euroTotal).toBe(398.06);
	});

	it("does not re-render when the route says the same thing", async () => {
		const { calls, onUpdate } = collect();
		await loadTreasuryProgressive(onUpdate, {
			reader: async () => payload(398.06, "2026-10-01T08:00:00.000Z"),
			fetchImpl: () => later(response(payload(398.06, "2026-10-01T09:00:00.000Z")), 20),
		});
		expect(calls).toEqual([{ euro: 398.06, source: "snapshot" }]);
	});

	it("a cold start renders the cached payload before any network", async () => {
		await cacheTreasury(parseTreasuryApi(payload(380, "2026-09-30T08:00:00.000Z"))!);
		const { calls, onUpdate } = collect();
		const final = await loadTreasuryProgressive(onUpdate, {
			reader: async () => null, // offline / no row
			fetchImpl: async () => {
				throw new Error("offline");
			},
		});
		expect(calls).toEqual([{ euro: 380, source: "cache" }]);
		expect(final?.euroTotal).toBe(380);
	});

	it("an older snapshot never replaces a newer cache", async () => {
		await cacheTreasury(parseTreasuryApi(payload(398, "2026-10-01T09:00:00.000Z"))!);
		const { calls, onUpdate } = collect();
		await loadTreasuryProgressive(onUpdate, {
			reader: async () => payload(300, "2026-09-01T09:00:00.000Z"),
			fetchImpl: async () => response({}, 503),
		});
		expect(calls).toEqual([{ euro: 398, source: "cache" }]);
	});

	it("a degraded route answer never replaces a complete snapshot", async () => {
		const { calls, onUpdate } = collect();
		const final = await loadTreasuryProgressive(onUpdate, {
			reader: async () => payload(398, "2026-10-01T08:00:00.000Z"),
			fetchImpl: () =>
				later(response(payload(397, "2026-10-01T09:00:00.000Z", { historyAvailable: false, history: [] })), 10),
		});
		expect(calls.map((c) => c.source)).toEqual(["snapshot"]);
		expect(final?.historyAvailable).toBe(true);
	});

	it("route + snapshot both missing → null (the screen runs the on-device fallback)", async () => {
		const { calls, onUpdate } = collect();
		const final = await loadTreasuryProgressive(onUpdate, {
			reader: async () => {
				throw new Error('relation "treasury_snapshot" does not exist');
			},
			fetchImpl: async () => response({}, 404),
		});
		expect(calls).toEqual([]);
		expect(final).toBeNull();
	});

	it("caches the route's complete answer for the next cold start, keeping the history links", async () => {
		await loadTreasuryProgressive(() => undefined, {
			reader: async () => null,
			fetchImpl: async () => response(payload(401, "2026-10-01T10:00:00.000Z")),
		});
		const cached = await readCachedTreasury();
		expect(cached?.euroTotal).toBe(401);
		expect(cached?.history[0].link).toEqual({ type: "proposal", id: "p1", title: "Bank" });
	});
});

describe("fetchTreasurySnapshot", () => {
	it("gives up after the short timeout", async () => {
		const snap = await fetchTreasurySnapshot({ reader: () => later(payload(1, "x"), 200), timeoutMs: 20 });
		expect(snap).toBeNull();
	});

	it("rejects a malformed payload", async () => {
		expect(await fetchTreasurySnapshot({ reader: async () => ({ euroTotal: "x" }) })).toBeNull();
	});
});
