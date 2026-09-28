import {
	applyBalancingRow,
	applyHiddenTxs,
	curateTreasuryHistory,
	parseBalancingTx,
	parseHiddenTxs,
	sumSignedCents,
	toCents,
	type CuratableRow,
} from "../treasury-history";

const row = (txHash: string, direction: "in" | "out", amount: number): CuratableRow => ({
	txHash,
	direction,
	amount,
});

describe("toCents", () => {
	it("rounds to the displayed cent", () => {
		expect(toCents(219.456)).toBe(21946);
		expect(toCents(1.005)).toBe(101);
		expect(toCents(0)).toBe(0);
		expect(toCents(Number.NaN)).toBe(0);
	});
});

describe("parseHiddenTxs", () => {
	it("returns [] for missing or invalid values", () => {
		expect(parseHiddenTxs(null)).toEqual([]);
		expect(parseHiddenTxs("")).toEqual([]);
		expect(parseHiddenTxs("not json")).toEqual([]);
		expect(parseHiddenTxs('{"a":1}')).toEqual([]);
	});
	it("lowercases, trims, de-duplicates and drops non-strings", () => {
		expect(parseHiddenTxs('["0xABC", "0xabc", " 0xDef ", 5, null, ""]')).toEqual(["0xabc", "0xdef"]);
	});
});

describe("parseBalancingTx", () => {
	it("accepts bare and JSON-quoted hashes, any case", () => {
		expect(parseBalancingTx("0xAbC")).toBe("0xabc");
		expect(parseBalancingTx('"0xAbC"')).toBe("0xabc");
		expect(parseBalancingTx("  ")).toBeNull();
		expect(parseBalancingTx(null)).toBeNull();
	});
});

describe("applyHiddenTxs", () => {
	const rows = [row("0xaa", "in", 10), row("0xBB", "out", 5), row("0xcc", "in", 1), row("0xbb", "in", 2)];

	it("drops every row of a hidden tx (native and token legs), case-insensitive", () => {
		expect(applyHiddenTxs(rows, ["0xBB"]).map((r) => r.txHash)).toEqual(["0xaa", "0xcc"]);
	});
	it("tolerates duplicate and mixed-case entries in the list", () => {
		expect(applyHiddenTxs(rows, ["0xAA", "0xaa", "0xAa"]).map((r) => r.txHash)).toEqual([
			"0xBB",
			"0xcc",
			"0xbb",
		]);
	});
	it("is a no-op for an empty list", () => {
		expect(applyHiddenTxs(rows, [])).toBe(rows);
	});
	it("never hides rows without a hash", () => {
		expect(applyHiddenTxs([row("", "in", 1)], ["0xaa"])).toHaveLength(1);
	});
});

describe("applyBalancingRow", () => {
	it("makes the visible rows sum exactly to the live total", () => {
		const rows = [row("0x1", "in", 100.004), row("0x2", "out", 20.333), row("0xBAL", "in", 50)];
		const out = applyBalancingRow(rows, "0xbal", 150.117);
		expect(sumSignedCents(out)).toBe(toCents(150.117));
		const bal = out.find((r) => r.txHash === "0xBAL")!;
		expect(bal.direction).toBe("in");
		// 150.12 − (100.00 − 20.33) = 70.45
		expect(bal.amount).toBe(70.45);
		// other rows normalised to whole cents
		expect(out.find((r) => r.txHash === "0x2")!.amount).toBe(20.33);
	});

	it("turns a negative balance into an outflow of the absolute value", () => {
		const rows = [row("0x1", "in", 300), row("0xbal", "in", 10)];
		const out = applyBalancingRow(rows, "0xBAL", 250);
		const bal = out.find((r) => r.txHash === "0xbal")!;
		expect(bal.direction).toBe("out");
		expect(bal.amount).toBe(50);
		expect(sumSignedCents(out)).toBe(25000);
	});

	it("leaves rows untouched when the balancing tx is not visible", () => {
		const rows = [row("0x1", "in", 1.234)];
		expect(applyBalancingRow(rows, "0xmissing", 99)).toBe(rows);
	});

	it("leaves rows untouched without a live total (snapshot fallback)", () => {
		const rows = [row("0xbal", "in", 1.234)];
		expect(applyBalancingRow(rows, "0xbal", null)).toBe(rows);
		expect(applyBalancingRow(rows, "0xbal", undefined)).toBe(rows);
		expect(applyBalancingRow(rows, "0xbal", Number.NaN)).toBe(rows);
	});

	it("leaves rows untouched without a balancing tx", () => {
		const rows = [row("0xbal", "in", 1)];
		expect(applyBalancingRow(rows, null, 5)).toBe(rows);
	});

	it("folds a balancing tx that appears in several rows into one row", () => {
		const rows = [row("0xBAL", "in", 5), row("0x1", "in", 10), row("0xbal", "out", 2)];
		const out = applyBalancingRow(rows, "0xbal", 12.5);
		expect(out.map((r) => r.txHash)).toEqual(["0xBAL", "0x1"]);
		expect(out[0].amount).toBe(2.5);
		expect(sumSignedCents(out)).toBe(1250);
	});
});

describe("curateTreasuryHistory", () => {
	it("hides first, then balances against the remaining rows", () => {
		const rows = [row("0xhide", "in", 1000), row("0x1", "out", 10), row("0xbal", "in", 1)];
		const out = curateTreasuryHistory(rows, { hidden: ["0xHIDE"], balancingTx: "0xBAL", liveTotal: 40 });
		expect(out.map((r) => r.txHash)).toEqual(["0x1", "0xbal"]);
		expect(out[1].amount).toBe(50);
		expect(sumSignedCents(out)).toBe(4000);
	});
	it("does not balance when the balancing tx itself is hidden", () => {
		const rows = [row("0xbal", "in", 1), row("0x1", "in", 2)];
		const out = curateTreasuryHistory(rows, { hidden: ["0xbal"], balancingTx: "0xbal", liveTotal: 99 });
		expect(out).toEqual([row("0x1", "in", 2)]);
	});
});
