import { useEffect, useState } from "react";
import { useGnosisWallet } from "@/context/GnosisWalletContext";
import { attesterSafeGnosisAddress, roebeltalerGroupAddress } from "@/constants/gnosis";
import { getCirclesProfile } from "@/lib/circles-profile";
import { supabase } from "@/lib/supabase";

const CIRCLES_RPC = "https://rpc.aboutcircles.com/";

// System accounts that hold RCRC but are not people — the leaderboard ranks
// citizens only. Mirrors the ADDR set in apps/web/src/lib/muenzen/constants.ts.
const SYSTEM_ADDRESSES = new Set(
	[
		"0x0000000000000000000000000000000000000000",
		roebeltalerGroupAddress, // the group token itself
		attesterSafeGnosisAddress, // Stadtkasse multisig (reserve / group owner)
		"0x0476fd3bD5EbCE0Af18C70dE221eC47F508e8763", // BaseTreasury vault (collateral)
		"0x910A0C7Ae84E745B06eC6362Fa29Cd3779e0b96b", // BaseMintHandler
		"0xd5028284017A32C672CbD73Fe35aCD897bA874cf", // group auto-invite bot
		"0x5ac82fD7f576c86aed8d174074bA707eC1979D9B", // operational funder (rewards sink)
	].map((a) => a.toLowerCase()),
);

async function circlesQuery(query: Record<string, unknown>): Promise<Record<string, any>[]> {
	const res = await fetch(CIRCLES_RPC, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "circles_query", params: [query] }),
	});
	const json = await res.json();
	const result = json?.result ?? { columns: [], rows: [] };
	const columns: string[] = result.columns ?? [];
	const rows: any[][] = result.rows ?? [];
	return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}

export interface LeaderboardEntry {
	address: string;
	/** 1-based rank by balance. */
	rank: number;
	/** Display name — never a raw wallet address. */
	name: string;
	imageUrl: string | null;
	/** Röbel Münzen balance (display number). */
	amount: number;
	/** Distinct trust connections, null while unknown / when the lookup failed. */
	connections: number | null;
	/** Share of the circulating supply among ranked holders, 0..1. */
	supplyShare: number;
	isSelf: boolean;
}

/** All group-token holders ranked by live (demurraged) balance, people only. */
async function fetchHolders(): Promise<{ address: string; amount: number }[]> {
	const rows = await circlesQuery({
		Namespace: "V_CrcV2",
		Table: "GroupTokenHoldersBalance",
		Columns: [],
		Filter: [
			{
				Type: "FilterPredicate",
				FilterType: "Equals",
				Column: "group",
				Value: roebeltalerGroupAddress.toLowerCase(),
			},
		],
		Order: [],
		Limit: 1000,
	});
	const holders: { address: string; amount: number }[] = [];
	for (const r of rows) {
		const address = String(r.holder ?? "").toLowerCase();
		if (!address || SYSTEM_ADDRESSES.has(address)) continue;
		let amount = 0;
		try {
			amount = Number(BigInt(r.demurragedTotalBalance ?? r.totalBalance ?? "0")) / 1e18;
		} catch {
			continue;
		}
		if (amount <= 0) continue;
		holders.push({ address, amount });
	}
	holders.sort((a, b) => b.amount - a.amount);
	return holders;
}

/**
 * Distinct trust connections per holder ("Mit N Personen verbunden"), from the
 * v2 trust graph in both directions. Best-effort: any failure returns an empty
 * map and the UI falls back to the supply-share subtitle.
 */
async function fetchConnectionCounts(addresses: string[]): Promise<Map<string, number>> {
	const counts = new Map<string, Set<string>>();
	const wanted = new Set(addresses);
	const queryDirection = (column: "truster" | "trustee") =>
		circlesQuery({
			Namespace: "V_Crc",
			Table: "TrustRelations",
			Columns: [],
			Filter: [
				{
					Type: "Conjunction",
					ConjunctionType: "And",
					Predicates: [
						{ Type: "FilterPredicate", FilterType: "Equals", Column: "version", Value: 2 },
						{
							Type: "Conjunction",
							ConjunctionType: "Or",
							Predicates: addresses.map((a) => ({
								Type: "FilterPredicate",
								FilterType: "Equals",
								Column: column,
								Value: a,
							})),
						},
					],
				},
			],
			Order: [],
			Limit: 2000,
		});
	try {
		const [asTruster, asTrustee] = await Promise.all([
			queryDirection("truster"),
			queryDirection("trustee"),
		]);
		const add = (self: string, other: string) => {
			if (!self || !other || self === other || SYSTEM_ADDRESSES.has(other) || !wanted.has(self)) return;
			let set = counts.get(self);
			if (!set) counts.set(self, (set = new Set()));
			set.add(other);
		};
		for (const r of asTruster) add(String(r.truster ?? "").toLowerCase(), String(r.trustee ?? "").toLowerCase());
		for (const r of asTrustee) add(String(r.trustee ?? "").toLowerCase(), String(r.truster ?? "").toLowerCase());
	} catch {
		return new Map();
	}
	return new Map(Array.from(counts, ([a, set]) => [a, set.size]));
}

/**
 * Röbel Münzen leaderboard — every holder of the group token ranked by balance.
 * Renders fast with app profile names (Supabase), then enriches missing names
 * with Circles avatar metadata and trust-connection counts.
 */
export function useMuenzenLeaderboard() {
	const { gnosisAddress } = useGnosisWallet();
	const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		(async () => {
			try {
				const holders = await fetchHolders();
				const self = (gnosisAddress ?? "").toLowerCase();
				const total = holders.reduce((s, h) => s + h.amount, 0);

				// App profiles first — display name + picture come from the app's own
				// users table (never Circles metadata) whenever the holder is a user.
				const profiles = new Map<string, { name: string | null; imageUrl: string | null }>();
				try {
					const { data } = await supabase
						.from("users")
						.select("wallet_address, username, display_name, profile_picture_url")
						.in("wallet_address", holders.map((h) => h.address));
					for (const u of (data ?? []) as any[]) {
						const w = (u.wallet_address as string | null)?.toLowerCase();
						if (!w) continue;
						profiles.set(w, {
							name: (u.display_name as string) || (u.username as string) || null,
							imageUrl: (u.profile_picture_url as string) || null,
						});
					}
				} catch {
					/* ignore — Circles fallback below */
				}

				const build = (connections: Map<string, number> | null): LeaderboardEntry[] =>
					holders.map((h, i) => {
						const p = profiles.get(h.address);
						return {
							address: h.address,
							rank: i + 1,
							name: p?.name || "Mitglied",
							imageUrl: p?.imageUrl ?? null,
							amount: h.amount,
							connections: connections?.get(h.address) ?? null,
							supplyShare: total > 0 ? h.amount / total : 0,
							isSelf: h.address === self,
						};
					});

				if (cancelled) return;
				setEntries(build(null));
				setLoading(false);

				// Enrichment pass: Circles profiles for holders the app doesn't know,
				// plus trust-connection counts. Both best-effort.
				const unresolved = holders.filter((h) => !profiles.get(h.address)?.name).slice(0, 30);
				const [connections] = await Promise.all([
					fetchConnectionCounts(holders.slice(0, 50).map((h) => h.address)),
					Promise.all(
						unresolved.map(async (h) => {
							try {
								const p = await getCirclesProfile(h.address);
								if (p.name || p.imageUrl) {
									const known = profiles.get(h.address);
									profiles.set(h.address, {
										name: known?.name ?? p.name,
										imageUrl: known?.imageUrl ?? p.imageUrl,
									});
								}
							} catch {
								/* leave unresolved */
							}
						}),
					),
				]);
				if (cancelled) return;
				setEntries(build(connections));
			} catch {
				if (!cancelled) {
					setEntries([]);
					setLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [gnosisAddress]);

	return { entries, loading };
}
