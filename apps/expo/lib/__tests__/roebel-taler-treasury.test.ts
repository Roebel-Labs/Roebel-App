// The on-device fallback must never invent a rate (the old 0.92 constant
// showed 452 xDAI as 415,84 € while the real value was ~397 €).
jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("thirdweb", () => ({
	getContract: jest.fn(() => ({})),
	readContract: jest.fn(async () => 0n),
	prepareContractCall: jest.fn(),
}));
jest.mock("@/constants/thirdweb", () => ({ client: {} }));
jest.mock("@/constants/gnosis", () => ({
	gnosis: {},
	gnosisRead: {},
	circlesHubAddress: "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8",
	roebeltalerGroupAddress: "0xAc2C000000000000000000000000000000000001",
	attesterSafeGnosisAddress: "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa",
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTreasuryEuro, getTreasuryHistory } from "../roebel-taler";
import { __resetTreasuryApiMemo, rememberRate } from "../treasury-api";
import { TREASURY_SNAPSHOT } from "@/constants/treasury-snapshot";

const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const XDAI_452 = "0x" + (452n * 10n ** 18n).toString(16);

type Route = (url: string, init?: RequestInit) => unknown;
function installFetch(route: Route) {
	(global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
		const out = route(url, init);
		if (out instanceof Error) throw out;
		if (out === 404) return { ok: false, status: 404, json: async () => ({}) };
		return { ok: true, status: 200, json: async () => out };
	});
}

const chainOnly: Route = (url) => {
	if (url.endsWith("/api/treasury")) return 404; // 3.7.0 before the route is live
	if (url.startsWith("https://rpc.gnosischain.com")) return { result: XDAI_452 };
	return new Error(`offline: ${url}`); // every rate source is down
};

beforeEach(async () => {
	__resetTreasuryApiMemo();
	await AsyncStorage.clear();
});

describe("treasury € figure", () => {
	it("uses /api/treasury when it answers", async () => {
		installFetch((url) =>
			url === "https://www.roebel.app/api/treasury"
				? { euroTotal: 398.06, xdai: 452, eure: 0, rate: 0.88067, rateSource: "frankfurter", asOf: "x", history: [], historyAvailable: true }
				: new Error("should not be called"),
		);
		expect(await getTreasuryEuro(SAFE)).toBe(398.06);
	});

	it("route 404 + every rate source down + no remembered rate → the dated snapshot, never 452 × 0.92", async () => {
		installFetch(chainOnly);
		const euro = await getTreasuryEuro(SAFE);
		expect(euro).not.toBeCloseTo(452 * 0.92, 2);
		expect(euro).toBe(TREASURY_SNAPSHOT.euroTotal);
	});

	it("route 404 + rate sources down → the last remembered rate", async () => {
		await rememberRate(0.8795);
		installFetch(chainOnly);
		expect(await getTreasuryEuro(SAFE)).toBeCloseTo(452 * 0.8795, 6);
	});

	it("route 404 → the on-device rate comes from frankfurter (ECB) first", async () => {
		installFetch((url) => {
			if (url.startsWith("https://api.frankfurter.app/latest")) return { rates: { EUR: 0.88 } };
			return chainOnly(url);
		});
		// Runs after the offline cases on purpose: the module keeps a 10-min
		// in-memory rate once a live source answered.
		expect(await getTreasuryEuro(SAFE)).toBeCloseTo(452 * 0.88, 6);
	});
});

describe("treasury history", () => {
	it("renders the route's rows as final (curated) — no per-row rate calls", async () => {
		const fetchMock = jest.fn();
		installFetch((url) => {
			fetchMock(url);
			return url.endsWith("/api/treasury")
				? {
						euroTotal: 10,
						xdai: 0,
						eure: 10,
						rate: 0.88,
						rateSource: "frankfurter",
						asOf: "x",
						historyAvailable: true,
						history: [{ txHash: "0xa", direction: "in", euro: 10, timestamp: 1, label: "Eingang", link: { type: "proposal", id: "42", title: "Bänke" } }],
					}
				: new Error("unexpected");
		});
		const h = await getTreasuryHistory(SAFE);
		expect(h.curated).toBe(true);
		expect(h.rows).toEqual([
			{ direction: "in", amount: 10, currency: "eur", timestamp: 1, label: "Eingang", txHash: "0xa", link: { type: "proposal", id: "42", title: "Bänke" } },
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls.some(([u]) => String(u).includes("coingecko"))).toBe(false);
	});
});
