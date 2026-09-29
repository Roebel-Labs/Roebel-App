import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTreasuryResponse, linkTitle, TreasuryUnavailableError, type TreasuryDeps } from "./build";
import { parseFlows } from "./flows";
import { toCents } from "./curation";

const SAFE = "0x3a08c86efc5ff38cc35d850f1d4d564e497bfdea";
const day = (iso: string) => Date.parse(iso);

function deps(over: Partial<TreasuryDeps> = {}): TreasuryDeps {
	return {
		address: SAFE,
		readBalances: async () => ({ xdai: 452, eure: 0 }),
		getCurrentRate: async () => ({ rate: 0.88067, source: "frankfurter" }),
		fetchFlows: async () => [
			{ kind: "xdai", direction: "in", amount: 250, timestamp: day("2026-09-10T10:00:00Z"), txHash: "0xbal" },
			{ kind: "xdai", direction: "in", amount: 202, timestamp: day("2026-09-28T10:00:00Z"), txHash: "0xnew" },
			{ kind: "xdai", direction: "in", amount: 1000, timestamp: day("2026-09-01T10:00:00Z"), txHash: "0xhidden" },
			{ kind: "eure", direction: "out", amount: 0, timestamp: day("2026-09-02T10:00:00Z"), txHash: "0xzero" },
		],
		getDayRates: async (days) => new Map(days.map((d) => [d, d === "2026-09-10" ? 0.85 : 0.877])),
		readCuration: async () => ({ hidden: ["0xhidden"], balancingTx: "0xbal" }),
		readLinks: async () => new Map([["0xnew", { type: "post" as const, id: "p1", title: "Spende vom Sommerfest" }]]),
		now: () => day("2026-09-29T12:00:00Z"),
		...over,
	};
}

const signedSum = (rows: { direction: string; euro: number }[]) =>
	rows.reduce((s, r) => s + (r.direction === "in" ? 1 : -1) * toCents(r.euro), 0);

test("euroTotal = xdai × current rate + eure, and the rows sum to it exactly", async () => {
	const r = await buildTreasuryResponse(deps());
	assert.equal(r.euroTotal, 398.06); // 452 × 0.88067 = 398.06284
	assert.equal(r.rateSource, "frankfurter");
	assert.equal(r.balanced, true);
	assert.equal(signedSum(r.history), toCents(r.euroTotal));
	assert.deepEqual(r.history.map((h) => h.txHash), ["0xnew", "0xbal"], "newest first, hidden + zero rows gone");
	assert.equal(r.history[0].euro, 177.15); // 202 × 0.877 day rate
	assert.equal(r.history[1].euro, 220.91); // balancing row absorbs the gap
	assert.deepEqual(r.history[0].link, { type: "post", id: "p1", title: "Spende vom Sommerfest" });
	assert.equal(r.history[1].link, null);
});

test("fails closed when balances can't be read or no rate exists", async () => {
	await assert.rejects(buildTreasuryResponse(deps({ readBalances: async () => { throw new Error("rpc down"); } })), TreasuryUnavailableError);
	await assert.rejects(buildTreasuryResponse(deps({ getCurrentRate: async () => null })), TreasuryUnavailableError);
});

test("Blockscout down → balances still served, history flagged unavailable", async () => {
	const r = await buildTreasuryResponse(deps({ fetchFlows: async () => { throw new Error("hang"); } }));
	assert.equal(r.euroTotal, 398.06);
	assert.equal(r.historyAvailable, false);
	assert.deepEqual(r.history, []);
	assert.equal(r.balanced, false);
});

test("parseFlows: skips delegatecall phantoms, reverted frames, other tokens; dedupes the top-level frame", () => {
	const flows = parseFlows(
		SAFE,
		[
			{ hash: "0xa", from: "0xdonor", to: SAFE, value: "202000000000000000000", timeStamp: "1790693485", isError: "0" },
			{ hash: "0xf", from: "0xdonor", to: SAFE, value: "5000000000000000000", timeStamp: "1790693485", isError: "1" },
		],
		[
			{ transactionHash: "0xa", from: "0xdonor", to: SAFE, value: "202000000000000000000", timeStamp: "1790693485", callType: "call", isError: "0" },
			{ transactionHash: "0xa", from: SAFE, to: "0xsingleton", value: "202000000000000000000", timeStamp: "1790693485", callType: "delegatecall", type: "call", isError: "0" },
			{ transactionHash: "0xb", from: SAFE, to: "0xpayee", value: "50000000000000000000", timeStamp: "1790600000", callType: "call", isError: "0" },
		],
		[
			{ hash: "0xc", from: SAFE, to: "0xshop", value: "10000000000000000000", tokenDecimal: "18", timeStamp: "1790500000", contractAddress: "0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430" },
			{ hash: "0xd", from: "0xx", to: SAFE, value: "1", tokenDecimal: "18", timeStamp: "1790500000", contractAddress: "0xother" },
		],
	);
	assert.deepEqual(
		flows.map((f) => [f.kind, f.txHash, f.direction, f.amount]),
		[
			["xdai", "0xa", "in", 202],
			["xdai", "0xb", "out", 50],
			["eure", "0xc", "out", 10],
		],
	);
});

test("linkTitle: first non-empty line, cut at a word with an ellipsis", () => {
	assert.equal(linkTitle("\n  Neue Bänke für den Markt  \nmehr Text"), "Neue Bänke für den Markt");
	const long = "Wir haben beim Sommerfest gesammelt und das Geld geht vollständig in die Gemeinschaftskasse der Stadt Röbel";
	const t = linkTitle(long);
	assert.ok(t.length <= 80 && t.endsWith("…") && !t.includes("  "));
	assert.equal(linkTitle(null), "");
});
