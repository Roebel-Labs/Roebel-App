// Assembles the /api/treasury response: ONE server-side figure for every app
// surface. Dependencies are injected so the whole pipeline is unit-testable.

import { curateTreasuryHistory, toCents, sumSignedCents, type CuratableRow } from "./curation";
import type { Flow } from "./flows";
import { utcDay, type RateResult } from "./rates";

export interface TreasuryLink {
	type: "proposal" | "post";
	/** Route id: proposals.proposal_id for `/proposal/[id]`, posts.id for `/post/[id]`. */
	id: string;
	title: string;
}

export interface TreasuryHistoryRow {
	txHash: string;
	direction: "in" | "out";
	/** Positive € amount, whole cents. */
	euro: number;
	/** Epoch ms. */
	timestamp: number;
	label: string;
	link: TreasuryLink | null;
}

export interface TreasuryResponse {
	euroTotal: number;
	xdai: number;
	eure: number;
	/** USD→EUR (= xDAI→EUR) used for `euroTotal`. */
	rate: number;
	rateSource: string;
	/** ISO time the figures were computed. */
	asOf: string;
	history: TreasuryHistoryRow[];
	/** false = the history could not be read (Blockscout down); balances are still live. */
	historyAvailable: boolean;
	/** true = the history rows sum exactly to euroTotal. */
	balanced: boolean;
}

export interface TreasuryDeps {
	address: string;
	readBalances: () => Promise<{ xdai: number; eure: number }>;
	getCurrentRate: () => Promise<RateResult | null>;
	fetchFlows: () => Promise<Flow[]>;
	getDayRates: (days: string[], currentRate: number) => Promise<Map<string, number>>;
	readCuration: () => Promise<{ hidden: string[]; balancingTx: string | null }>;
	readLinks: (txHashes: string[]) => Promise<Map<string, TreasuryLink>>;
	now?: () => number;
}

export class TreasuryUnavailableError extends Error {}

/** Trim a title to one line and a sensible length (for the history row's link line). */
export function linkTitle(raw: string | null | undefined, max = 80): string {
	const line = String(raw ?? "")
		.split(/\r?\n/)
		.map((s) => s.trim())
		.find((s) => s.length > 0) ?? "";
	if (line.length <= max) return line;
	const cut = line.slice(0, max - 1);
	const space = cut.lastIndexOf(" ");
	return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

type Row = CuratableRow & { timestamp: number; label: string };

export async function buildTreasuryResponse(deps: TreasuryDeps): Promise<TreasuryResponse> {
	const now = deps.now ?? Date.now;

	let balances: { xdai: number; eure: number };
	try {
		balances = await deps.readBalances();
	} catch (e) {
		throw new TreasuryUnavailableError(`balances unreadable: ${(e as Error)?.message ?? e}`);
	}
	if (!Number.isFinite(balances.xdai) || !Number.isFinite(balances.eure)) {
		throw new TreasuryUnavailableError("balances not finite");
	}
	const rate = await deps.getCurrentRate();
	if (!rate) throw new TreasuryUnavailableError("no USD→EUR rate available");

	const euroTotal = toCents(balances.xdai * rate.rate + balances.eure) / 100;

	let rows: Row[] = [];
	let historyAvailable = true;
	try {
		const flows = await deps.fetchFlows();
		const days = flows.filter((f) => f.kind === "xdai").map((f) => utcDay(f.timestamp || now()));
		const dayRates = await deps.getDayRates(days, rate.rate);
		rows = flows.map((f) => ({
			direction: f.direction,
			amount:
				f.kind === "eure"
					? f.amount
					: f.amount * (dayRates.get(utcDay(f.timestamp || now())) ?? rate.rate),
			txHash: f.txHash,
			timestamp: f.timestamp,
			label: f.direction === "in" ? "Eingang" : "Ausgang",
		}));
	} catch {
		historyAvailable = false;
		rows = [];
	}

	// Newest first (the order the app renders), then the app's exact curation.
	rows.sort((a, b) => b.timestamp - a.timestamp);
	const curation = await deps.readCuration().catch(() => ({ hidden: [] as string[], balancingTx: null }));
	const curated = historyAvailable
		? curateTreasuryHistory(rows, { hidden: curation.hidden, balancingTx: curation.balancingTx, liveTotal: euroTotal })
		: [];
	const links = curated.length
		? await deps.readLinks(curated.map((r) => r.txHash.toLowerCase())).catch(() => new Map<string, TreasuryLink>())
		: new Map<string, TreasuryLink>();

	const history: TreasuryHistoryRow[] = curated
		.filter((r) => toCents(r.amount) > 0)
		.map((r) => ({
			txHash: r.txHash,
			direction: r.direction,
			euro: toCents(r.amount) / 100,
			timestamp: r.timestamp,
			label: r.label,
			link: links.get(r.txHash.toLowerCase()) ?? null,
		}));

	return {
		euroTotal,
		xdai: balances.xdai,
		eure: balances.eure,
		rate: rate.rate,
		rateSource: rate.source,
		asOf: new Date(now()).toISOString(),
		history,
		historyAvailable,
		balanced:
			historyAvailable &&
			sumSignedCents(history.map((h) => ({ direction: h.direction, amount: h.euro, txHash: h.txHash }))) ===
				toCents(euroTotal),
	};
}
