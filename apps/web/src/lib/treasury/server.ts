// Live wiring for /api/treasury: Gnosis RPC (viem), Blockscout, rate sources
// and Supabase (service role). Server-only.

import { createPublicClient, fallback, http, parseAbi, formatUnits, type Address } from "viem";
import { gnosis } from "viem/chains";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildTreasuryResponse, linkTitle, type TreasuryLink, type TreasuryResponse } from "./build";
import { parseBalancingTx, parseHiddenTxs } from "./curation";
import { EURE_V2_ADDRESS, fetchFlows } from "./flows";
import { getCurrentUsdEurRate, getDayRates, type DayRateStore } from "./rates";

/** The Gemeinschaftskasse = the Attester Safe on Gnosis. */
export const TREASURY_SAFE: Address = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

function publicClient() {
	const primary = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";
	return createPublicClient({
		chain: gnosis,
		transport: fallback([
			http(primary, { timeout: 8000, retryCount: 1 }),
			http("https://gnosis-rpc.publicnode.com", { timeout: 8000, retryCount: 1 }),
		]),
	});
}

export async function readBalances(address: Address = TREASURY_SAFE) {
	const client = publicClient();
	const [native, eure] = await Promise.all([
		client.getBalance({ address }),
		client.readContract({ address: EURE_V2_ADDRESS as Address, abi: erc20, functionName: "balanceOf", args: [address] }),
	]);
	return { xdai: Number(formatUnits(native, 18)), eure: Number(formatUnits(eure, 18)) };
}

function adminClient(): SupabaseClient | null {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return null;
	return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** `treasury_eur_rates` store. Missing table / env = a no-op store (frankfurter is asked every cold start). */
export function supabaseDayRateStore(db: SupabaseClient | null): DayRateStore | null {
	if (!db) return null;
	return {
		async get(days) {
			const out = new Map<string, number>();
			if (!days.length) return out;
			const { data, error } = await db.from("treasury_eur_rates").select("day, usd_eur").in("day", days);
			if (error) return out;
			for (const r of data ?? []) out.set(String(r.day), Number(r.usd_eur));
			return out;
		},
		async put(rows) {
			if (!rows.length) return;
			await db
				.from("treasury_eur_rates")
				.upsert(rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })), { onConflict: "day" });
		},
		async latest() {
			const { data, error } = await db
				.from("treasury_eur_rates")
				.select("day, usd_eur")
				.order("day", { ascending: false })
				.limit(1)
				.maybeSingle();
			if (error || !data) return null;
			return { day: String(data.day), rate: Number(data.usd_eur) };
		},
	};
}

async function readCuration(db: SupabaseClient | null) {
	if (!db) return { hidden: [], balancingTx: null };
	const { data, error } = await db
		.from("app_settings")
		.select("key, value")
		.in("key", ["treasury_history_hidden_txs", "treasury_history_balancing_tx"]);
	if (error) return { hidden: [], balancingTx: null };
	const get = (k: string) => (data ?? []).find((r: any) => r.key === k)?.value ?? null;
	return { hidden: parseHiddenTxs(get("treasury_history_hidden_txs")), balancingTx: parseBalancingTx(get("treasury_history_balancing_tx")) };
}

/**
 * `treasury_tx_links` → one link per tx. A proposal link wins over a post link
 * when a row has both (outflows are decided by a Bürgerumfrage).
 */
async function readLinks(db: SupabaseClient | null, hashes: string[]): Promise<Map<string, TreasuryLink>> {
	const out = new Map<string, TreasuryLink>();
	if (!db || !hashes.length) return out;
	const { data, error } = await db
		.from("treasury_tx_links")
		.select("tx_hash, proposal:proposals(id, proposal_id, title), post:posts(id, content)")
		.in("tx_hash", [...new Set(hashes.map((h) => h.toLowerCase()))]);
	if (error) return out;
	for (const r of (data ?? []) as any[]) {
		const proposal = Array.isArray(r.proposal) ? r.proposal[0] : r.proposal;
		const post = Array.isArray(r.post) ? r.post[0] : r.post;
		if (proposal?.id) {
			out.set(String(r.tx_hash).toLowerCase(), {
				type: "proposal",
				id: String(proposal.proposal_id || proposal.id),
				title: linkTitle(proposal.title) || "Bürgerumfrage",
			});
		} else if (post?.id) {
			out.set(String(r.tx_hash).toLowerCase(), {
				type: "post",
				id: String(post.id),
				title: linkTitle(post.content) || "Beitrag",
			});
		}
	}
	return out;
}

export function computeTreasury(): Promise<TreasuryResponse> {
	const db = adminClient();
	const store = supabaseDayRateStore(db);
	return buildTreasuryResponse({
		address: TREASURY_SAFE,
		readBalances: () => readBalances(TREASURY_SAFE),
		getCurrentRate: () => getCurrentUsdEurRate({ fallbackLatest: store ? () => store.latest() : undefined }),
		fetchFlows: () => fetchFlows(TREASURY_SAFE),
		getDayRates: async (days, currentRate) => (await getDayRates(days, { store, currentRate })).rates,
		readCuration: () => readCuration(db),
		readLinks: (hashes) => readLinks(db, hashes),
	});
}

// Whole-response cache: 5 min when complete, 60 s when the history or the
// rate was degraded (so a Blockscout blip heals quickly). Concurrent cold
// requests share one computation.
const FULL_TTL_MS = 5 * 60_000;
const DEGRADED_TTL_MS = 60_000;
let cache: { at: number; ttl: number; value: TreasuryResponse } | null = null;
let inflight: Promise<TreasuryResponse> | null = null;

export async function getTreasuryCached(compute: () => Promise<TreasuryResponse> = computeTreasury): Promise<TreasuryResponse> {
	if (cache && Date.now() - cache.at < cache.ttl) return cache.value;
	if (inflight) return inflight;
	inflight = (async () => {
		try {
			const value = await compute();
			const degraded = !value.historyAvailable || value.rateSource.startsWith("cached:");
			cache = { at: Date.now(), ttl: degraded ? DEGRADED_TTL_MS : FULL_TTL_MS, value };
			return value;
		} finally {
			inflight = null;
		}
	})();
	return inflight;
}
