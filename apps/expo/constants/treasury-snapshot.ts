// Bundled fallback figure for the Gemeinschaftskasse (civic treasury) surfaces.
//
// While the treasury is being moved between addresses, the live on-chain read
// of the address the app watches can return 0 or fail outright. Showing "0 €"
// reads as "the money is gone", so every surface falls back to this dated
// snapshot instead, and the treasury screen labels it with its date so nobody
// mistakes it for a live figure.
//
// Refresh the numbers (or set TREASURY_SNAPSHOT_ENABLED to false) as soon as
// the funds sit at the address the app reads — see `attesterSafeGnosisAddress`
// in constants/gnosis.ts, overridable with EXPO_PUBLIC_ATTESTER_SAFE_GNOSIS.

/** Master switch. false = always show the live chain figure, 0 included. */
export const TREASURY_SNAPSHOT_ENABLED = true;

export const TREASURY_SNAPSHOT = {
	/**
	 * € value of the treasury, read on-chain on the date below:
	 * 224.522185 xDAI at 0.873372 €/xDAI + 0.00 EURe.
	 */
	euroTotal: 196.09,
	xdai: 224.522185,
	eure: 0,
	roebel: 0,
	/** ISO date the figures were read (machine readable). */
	asOfIso: "2026-09-22",
	/** German date shown under the hero figure while the snapshot is in use. */
	asOfLabel: "22.09.2026",
} as const;

/**
 * Below this the live euro figure counts as "not readable right now" (funds
 * moved away, RPC hiccup) and the snapshot takes over. A treasury that is
 * genuinely empty should set TREASURY_SNAPSHOT_ENABLED to false instead.
 */
export const TREASURY_LIVE_MIN_EURO = 1;

/**
 * Pick what the UI shows: the live figure when it is readable, otherwise the
 * snapshot. `fromSnapshot` tells the screen to render the "Stand: <date>" note.
 */
export function resolveTreasuryEuro(liveEuro: number | null | undefined): {
	euro: number;
	fromSnapshot: boolean;
} {
	const live = typeof liveEuro === "number" && Number.isFinite(liveEuro) ? liveEuro : null;
	if (!TREASURY_SNAPSHOT_ENABLED) return { euro: live ?? 0, fromSnapshot: false };
	if (live === null || live < TREASURY_LIVE_MIN_EURO) {
		return { euro: TREASURY_SNAPSHOT.euroTotal, fromSnapshot: true };
	}
	return { euro: live, fromSnapshot: false };
}
