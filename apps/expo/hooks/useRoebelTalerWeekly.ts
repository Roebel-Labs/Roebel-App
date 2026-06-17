import { useMemo } from "react";

/**
 * Weekly earned Röbel-Taler series for the chart. Returns the last 6 week labels
 * and per-week earned values.
 *
 * TODO(real data): wire the Circles transaction history (circlesRpcUrl
 * `getTransactionHistory`) — query transfers of the group token to the citizen,
 * bucket by ISO week, sum. Until then this returns an honest flat baseline (a new
 * account has earned 0 this period — same empty state Metri shows).
 */
export function useRoebelTalerWeekly() {
	return useMemo(() => {
		const labels: string[] = [];
		const points: number[] = [];
		const now = new Date();
		for (let i = 5; i >= 0; i--) {
			const d = new Date(now.getTime() - i * 7 * 86_400_000);
			labels.push(i === 0 ? "Heute" : d.toLocaleDateString("de-DE", { day: "numeric", month: "short" }));
			points.push(0);
		}
		return { labels, points, changePct: 0 };
	}, []);
}
