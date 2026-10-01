// Mirror of the latest complete /api/treasury answer into Supabase
// (`public.treasury_snapshot`, one row, id = 1). The Expo app reads that row
// with one select for a fast first paint and then asks the route. Writes use
// the service-role client; a failure (or the table not existing yet) is only
// logged — it must never break the route's response.

import type { TreasuryResponse } from "./build";

/** The slice of the Supabase client this needs (keeps it testable). */
export interface SnapshotDb {
	from(table: string): {
		upsert(
			row: Record<string, unknown>,
			opts?: { onConflict?: string },
		): PromiseLike<{ error: { message: string; code?: string } | null }>;
	};
}

/** No history or a remembered (not live) rate: not worth caching for the app. */
export function isDegradedTreasury(value: Pick<TreasuryResponse, "historyAvailable" | "rateSource">): boolean {
	return !value.historyAvailable || value.rateSource.startsWith("cached:");
}

/** Upsert a complete answer; returns whether it was written. Never throws. */
export async function persistTreasurySnapshot(
	value: TreasuryResponse,
	db: SnapshotDb | null,
	log: (msg: string) => void = (m) => console.warn(m),
): Promise<boolean> {
	if (!db || isDegradedTreasury(value)) return false;
	try {
		const { error } = await db
			.from("treasury_snapshot")
			.upsert(
				{ id: 1, payload: value, euro_total: value.euroTotal, updated_at: new Date().toISOString() },
				{ onConflict: "id" },
			);
		if (error) {
			// 42P01 = the migration is not applied yet: expected until it is.
			log(`[api/treasury] snapshot upsert failed (${error.code ?? "?"}): ${error.message}`);
			return false;
		}
		return true;
	} catch (e) {
		log(`[api/treasury] snapshot upsert threw: ${e instanceof Error ? e.message : String(e)}`);
		return false;
	}
}
