import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { curateTreasuryHistory, parseBalancingTx, parseHiddenTxs, sumSignedCents, type CuratableRow } from "./curation";

// The SAME vector the Expo jest test runs (apps/expo/lib/__tests__/treasury-history.test.ts).
const vectorPath = join(__dirname, "../../../../expo/lib/__tests__/treasury-history.vector.json");
const vector = JSON.parse(readFileSync(vectorPath, "utf8")) as {
	cases: {
		name: string;
		rows: CuratableRow[];
		hiddenRaw: string | null;
		balancingRaw: string | null;
		liveTotal: number | null;
		expected: CuratableRow[];
		expectedSumCents: number;
	}[];
};

test("shared vector is present", () => {
	assert.ok(vector.cases.length >= 6);
});

for (const c of vector.cases) {
	test(`shared curation vector: ${c.name}`, () => {
		const out = curateTreasuryHistory(c.rows, {
			hidden: parseHiddenTxs(c.hiddenRaw),
			balancingTx: parseBalancingTx(c.balancingRaw),
			liveTotal: c.liveTotal,
		});
		assert.deepEqual(out, c.expected);
		assert.equal(sumSignedCents(out), c.expectedSumCents);
	});
}

test("the web port is byte-identical to the app module below its header", () => {
	const web = readFileSync(join(__dirname, "curation.ts"), "utf8");
	const app = readFileSync(join(__dirname, "../../../../expo/lib/treasury-history.ts"), "utf8");
	assert.ok(web.endsWith(app), "apps/web/src/lib/treasury/curation.ts drifted from apps/expo/lib/treasury-history.ts");
});
