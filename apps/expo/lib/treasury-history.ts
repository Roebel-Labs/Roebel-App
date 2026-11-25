// Pure curation of the Gemeinschaftskasse history (no network, no React).
//
// Three admin-controlled knobs, all read from `app_settings`:
// - `treasury_history_hidden_txs`: tx hashes whose rows are never shown
//   (test transfers, internal moves between the treasury's own addresses).
// - `treasury_history_balancing_tx`: ONE tx whose row absorbs the difference
//   between the live treasury total and the other visible rows, so the visible
//   history always sums exactly to the hero figure. Native xDAI rows are valued
//   at their own day's rate while the hero is marked to market today, so without
//   this row the list and the total drift apart with every EUR/USD move.
// - `treasury_history_tx_labels`: tx hash → label shown instead of the
//   generic "Eingang"/"Ausgang" (e.g. a planned temporary move, announced as
//   such). The row stays visible with its real amount; only its title changes.
//
// All money math runs in integer cents: the rows as displayed sum to the total
// as displayed, to the cent.

export interface CuratableRow {
	direction: "in" | "out";
	/** Positive € amount. */
	amount: number;
	txHash: string;
}

/** Euro → integer cents, rounded the way the screen displays 2 decimals. */
export function toCents(euro: number): number {
	if (!Number.isFinite(euro)) return 0;
	// The small epsilon keeps binary artefacts like 1.005 → 1.00499999 from
	// rounding down.
	return Math.round(euro * 100 + (euro >= 0 ? 1e-7 : -1e-7));
}

/** Signed cents of a row: inflow +, outflow −. */
export function signedCents(row: CuratableRow): number {
	const c = toCents(row.amount);
	return row.direction === "in" ? c : -c;
}

const norm = (hash: string | null | undefined) => (hash ?? "").trim().toLowerCase();

/**
 * Parse the `treasury_history_hidden_txs` setting value: a JSON array of tx
 * hashes. Anything missing or malformed yields [] (= no filtering). Entries
 * are lowercased and de-duplicated; non-strings and blanks are dropped.
 */
export function parseHiddenTxs(raw: string | null | undefined): string[] {
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const out = new Set<string>();
	for (const entry of parsed) {
		if (typeof entry !== "string") continue;
		const h = norm(entry);
		if (h) out.add(h);
	}
	return [...out];
}

/** Parse the `treasury_history_balancing_tx` setting value; blank = null. */
export function parseBalancingTx(raw: string | null | undefined): string | null {
	if (typeof raw !== "string") return null;
	// Tolerate a JSON-quoted string ("\"0xabc\"") as well as the bare hash.
	let value = raw.trim();
	if (value.startsWith('"') && value.endsWith('"')) {
		try {
			const s = JSON.parse(value);
			if (typeof s === "string") value = s;
		} catch {
			/* keep as is */
		}
	}
	return norm(value) || null;
}

/**
 * Parse the `treasury_history_tx_labels` setting value: a JSON object of
 * tx hash → label. Missing or malformed yields {}; keys are lowercased, blank
 * labels dropped.
 */
export function parseTxLabels(raw: string | null | undefined): Record<string, string> {
	if (!raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	const out: Record<string, string> = {};
	for (const [hash, label] of Object.entries(parsed as Record<string, unknown>)) {
		const h = norm(hash);
		if (h && typeof label === "string" && label.trim()) out[h] = label.trim();
	}
	return out;
}

/**
 * Parse the `treasury_history_netted_txs` setting value: a JSON object of
 * inflow tx hash → outflow tx hash. A temporary move out that came back (plus a
 * donation) is shown as ONE inflow of the difference: the outflow row is
 * dropped and the inflow row carries in − out. Missing or malformed yields {}.
 */
export function parseNettedTxs(raw: string | null | undefined): Record<string, string> {
	if (!raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	const out: Record<string, string> = {};
	for (const [inTx, outTx] of Object.entries(parsed as Record<string, unknown>)) {
		const i = norm(inTx);
		if (i && typeof outTx === "string" && norm(outTx)) out[i] = norm(outTx);
	}
	return out;
}

/**
 * Net each configured pair (see parseNettedTxs): the outflow row is removed and
 * the inflow row's amount becomes in − out (an outflow of |in − out| if negative).
 * Pairs whose rows are not both present are left untouched.
 */
export function applyNettedTxs<T extends CuratableRow>(rows: T[], netted: Readonly<Record<string, string>> | undefined): T[] {
	if (!netted || !Object.keys(netted).length) return rows;
	const drop = new Set<string>();
	const replace = new Map<string, T>();
	for (const [inTx, outTx] of Object.entries(netted)) {
		const inRow = rows.find((r) => norm(r.txHash) === inTx && r.direction === "in");
		const outRow = rows.find((r) => norm(r.txHash) === outTx && r.direction === "out");
		if (!inRow || !outRow) continue;
		const cents = toCents(inRow.amount) - toCents(outRow.amount);
		replace.set(inTx, { ...inRow, direction: cents >= 0 ? "in" : "out", amount: Math.abs(cents) / 100 });
		drop.add(outTx);
	}
	if (!replace.size) return rows;
	return rows
		.filter((r) => !(drop.has(norm(r.txHash)) && r.direction === "out"))
		.map((r) => (r.direction === "in" && replace.has(norm(r.txHash)) ? (replace.get(norm(r.txHash)) as T) : r));
}

/** Drop every row (native AND ERC-20) whose tx hash is in `hidden`, any case. */
export function applyHiddenTxs<T extends CuratableRow>(rows: T[], hidden: readonly string[]): T[] {
	if (!hidden.length) return rows;
	const set = new Set(hidden.map(norm).filter(Boolean));
	return rows.filter((r) => !set.has(norm(r.txHash)));
}

/**
 * Make the visible rows sum to `liveTotal` exactly (in cents) by rewriting the
 * row of `balancingTx`:
 *   balancing = liveTotal − Σ(other visible rows, signed)
 * A negative result turns the row into an outflow of the absolute value.
 *
 * Leaves `rows` untouched when there is no live total (snapshot fallback) or
 * the balancing tx is not among the rows. If the tx appears in several rows
 * (native + token leg), the first one carries the balance and the others are
 * folded into it, so the sum still matches.
 *
 * When it applies, every row's amount is normalised to whole cents so the
 * displayed figures add up exactly.
 */
export function applyBalancingRow<T extends CuratableRow>(
	rows: T[],
	balancingTx: string | null | undefined,
	liveTotal: number | null | undefined,
): T[] {
	const target = norm(balancingTx);
	if (!target) return rows;
	if (typeof liveTotal !== "number" || !Number.isFinite(liveTotal)) return rows;
	const idx = rows.findIndex((r) => norm(r.txHash) === target);
	if (idx < 0) return rows;

	const others = rows.filter((r) => norm(r.txHash) !== target);
	const otherCents = others.reduce((s, r) => s + signedCents(r), 0);
	const balanceCents = toCents(liveTotal) - otherCents;

	const out: T[] = [];
	rows.forEach((r, i) => {
		if (i === idx) {
			out.push({
				...r,
				direction: balanceCents < 0 ? "out" : "in",
				amount: Math.abs(balanceCents) / 100,
			});
		} else if (norm(r.txHash) !== target) {
			out.push({ ...r, amount: toCents(r.amount) / 100 });
		}
	});
	return out;
}

/** Netting, hidden filter, then the balancing row — the order the screen applies them. */
export function curateTreasuryHistory<T extends CuratableRow>(
	rows: T[],
	opts: {
		hidden: readonly string[];
		balancingTx: string | null;
		liveTotal: number | null;
		netted?: Readonly<Record<string, string>>;
	},
): T[] {
	return applyBalancingRow(
		applyHiddenTxs(applyNettedTxs(rows, opts.netted), opts.hidden),
		opts.balancingTx,
		opts.liveTotal,
	);
}

/** Signed sum of rows in cents (in +, out −). */
export function sumSignedCents(rows: readonly CuratableRow[]): number {
	return rows.reduce((s, r) => s + signedCents(r), 0);
}
