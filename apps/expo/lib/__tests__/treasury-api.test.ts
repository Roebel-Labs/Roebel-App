jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	__resetTreasuryApiMemo,
	fetchTreasuryApi,
	parseTreasuryApi,
	readRememberedRate,
	REMEMBERED_RATE_MAX_AGE_MS,
	rememberRate,
	treasuryApiBase,
} from "../treasury-api";

const LIVE = {
	euroTotal: 398.06,
	xdai: 452,
	eure: 0,
	rate: 0.88067,
	rateSource: "frankfurter",
	asOf: "2026-09-29T18:28:25.900Z",
	historyAvailable: true,
	balanced: true,
	history: [
		{ txHash: "0x4c7e", direction: "in", euro: 177.9, timestamp: 1790693485000, label: "Eingang", link: null },
		{
			txHash: "0x6d0e",
			direction: "in",
			euro: 14.93,
			timestamp: 1790600000000,
			label: "Eingang",
			link: { type: "post", id: "abc", title: "Sommerfest" },
		},
		{ txHash: "0xbad", direction: "sideways", euro: 1, timestamp: 0 },
	],
};

const response = (body: unknown, status = 200) =>
	({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(async () => {
	__resetTreasuryApiMemo();
	await AsyncStorage.clear();
	delete process.env.EXPO_PUBLIC_API_BASE_URL;
});

describe("treasuryApiBase", () => {
	it("defaults to the www host (the apex 307-redirects)", () => {
		expect(treasuryApiBase()).toBe("https://www.roebel.app");
	});
	it("honours EXPO_PUBLIC_API_BASE_URL without a trailing slash", () => {
		process.env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:3000/";
		expect(treasuryApiBase()).toBe("http://localhost:3000");
	});
});

describe("parseTreasuryApi", () => {
	it("keeps valid rows and links, drops malformed rows", () => {
		const p = parseTreasuryApi(LIVE)!;
		expect(p.euroTotal).toBe(398.06);
		expect(p.history).toHaveLength(2);
		expect(p.history[1].link).toEqual({ type: "post", id: "abc", title: "Sommerfest" });
	});
	it("rejects a response without a sane rate or total", () => {
		expect(parseTreasuryApi({ ...LIVE, rate: 0.92e3 })).toBeNull();
		expect(parseTreasuryApi({ ...LIVE, euroTotal: "398" })).toBeNull();
		expect(parseTreasuryApi({ error: "treasury unavailable" })).toBeNull();
	});
});

describe("fetchTreasuryApi", () => {
	it("GETs {base}/api/treasury, returns the parsed body and remembers the rate", async () => {
		const fetchImpl = jest.fn(async () => response(LIVE));
		const r = await fetchTreasuryApi({ fetchImpl });
		expect(fetchImpl).toHaveBeenCalledWith("https://www.roebel.app/api/treasury", expect.objectContaining({ signal: expect.anything() }));
		expect(r?.euroTotal).toBe(398.06);
		expect(await readRememberedRate()).toBe(0.88067);
	});

	it("shares one request between concurrent callers", async () => {
		const fetchImpl = jest.fn(async () => response(LIVE));
		await Promise.all([fetchTreasuryApi({ fetchImpl }), fetchTreasuryApi({ fetchImpl }), fetchTreasuryApi({ fetchImpl })]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("404 (route not deployed yet) and 503 → null, and failures are not memoised", async () => {
		const fetchImpl = jest.fn(async () => response({ error: "x" }, 404));
		expect(await fetchTreasuryApi({ fetchImpl })).toBeNull();
		await new Promise((r) => setTimeout(r, 0));
		const ok = jest.fn(async () => response({}, 503));
		expect(await fetchTreasuryApi({ fetchImpl: ok })).toBeNull();
		expect(ok).toHaveBeenCalledTimes(1);
	});

	it("aborts a hanging request after the timeout instead of waiting forever", async () => {
		const fetchImpl = jest.fn(
			(_url: string, init?: RequestInit) =>
				new Promise<Response>((_, reject) => {
					init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
				}),
		);
		const started = Date.now();
		expect(await fetchTreasuryApi({ fetchImpl, timeoutMs: 50 })).toBeNull();
		expect(Date.now() - started).toBeLessThan(2000);
	});
});

describe("remembered rate", () => {
	it("round-trips, ignores insane values and expires after two weeks", async () => {
		await rememberRate(5);
		expect(await readRememberedRate()).toBeNull();
		await rememberRate(0.879);
		expect(await readRememberedRate()).toBe(0.879);
		expect(await readRememberedRate(Date.now() + REMEMBERED_RATE_MAX_AGE_MS + 1000)).toBeNull();
	});
});
