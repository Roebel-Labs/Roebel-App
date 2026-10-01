import { test } from "node:test";
import assert from "node:assert/strict";
import { isDegradedTreasury, persistTreasurySnapshot, type SnapshotDb } from "./snapshot";
import type { TreasuryResponse } from "./build";

const value = (over: Partial<TreasuryResponse> = {}) =>
	({
		euroTotal: 398.06,
		xdai: 452,
		eure: 0,
		rate: 0.88,
		rateSource: "frankfurter",
		asOf: "2026-10-01T08:00:00.000Z",
		history: [],
		historyAvailable: true,
		...over,
	}) as unknown as TreasuryResponse;

function fakeDb(result: { error: { message: string; code?: string } | null } | Error) {
	const calls: Array<{ table: string; row: Record<string, unknown>; opts?: unknown }> = [];
	const db: SnapshotDb = {
		from: (table) => ({
			upsert: (row, opts) => {
				calls.push({ table, row, opts });
				return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
			},
		}),
	};
	return { db, calls };
}

test("a complete answer is upserted into the single row", async () => {
	const { db, calls } = fakeDb({ error: null });
	assert.equal(await persistTreasurySnapshot(value(), db, () => {}), true);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].table, "treasury_snapshot");
	assert.equal(calls[0].row.id, 1);
	assert.equal(calls[0].row.euro_total, 398.06);
	assert.deepEqual(calls[0].opts, { onConflict: "id" });
});

test("degraded answers are never written", async () => {
	const { db, calls } = fakeDb({ error: null });
	assert.equal(await persistTreasurySnapshot(value({ historyAvailable: false }), db, () => {}), false);
	assert.equal(await persistTreasurySnapshot(value({ rateSource: "cached:2026-09-30" }), db, () => {}), false);
	assert.equal(calls.length, 0);
	assert.equal(isDegradedTreasury({ historyAvailable: true, rateSource: "frankfurter" }), false);
});

test("a missing table is logged, not thrown", async () => {
	const logs: string[] = [];
	const { db } = fakeDb({ error: { code: "42P01", message: 'relation "public.treasury_snapshot" does not exist' } });
	assert.equal(await persistTreasurySnapshot(value(), db, (m) => logs.push(m)), false);
	assert.equal(logs.length, 1);
});

test("a throwing client and no client never throw", async () => {
	const { db } = fakeDb(new Error("network"));
	assert.equal(await persistTreasurySnapshot(value(), db, () => {}), false);
	assert.equal(await persistTreasurySnapshot(value(), null, () => {}), false);
});
