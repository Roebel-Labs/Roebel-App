// Röbel Münzen on-chain service (Gnosis / Circles v2), accessed via thirdweb so we
// don't bundle the heavy Circles SDK into React Native. NOTE: per project rule the
// user-facing currency is ALWAYS "Röbel Münzen" — never surface "CRC"/Circles here.
//
// Mechanics (hidden from the user): each citizen is a Circles human on Gnosis;
//  - personalMint()          → the daily Röbel Münzen ("Heute abholen")
//  - groupMint(group,[me],[amt],"0x") → contributes to the shared Röbel Münzen
//  - Hub ERC1155 balanceOf(me, id=group) → the Röbel Münzen balance
import {
	getContract,
	readContract,
	prepareContractCall,
	type PreparedTransaction,
} from "thirdweb";
import { client } from "@/constants/thirdweb";
import {
	gnosis,
	gnosisRead,
	circlesHubAddress,
	roebeltalerGroupAddress,
} from "@/constants/gnosis";

const hubRead = getContract({ client, chain: gnosisRead, address: circlesHubAddress });
const hubWrite = getContract({ client, chain: gnosis, address: circlesHubAddress });

/** Circles encodes an avatar's token id as uint256(avatarAddress). */
const groupTokenId = BigInt(roebeltalerGroupAddress);

const ZERO_METADATA = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const CIRCLES_RPC = "https://rpc.aboutcircles.com/";

async function circlesQuery(query: Record<string, unknown>): Promise<Record<string, any>[]> {
	const res = await fetch(CIRCLES_RPC, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "circles_query", params: [query] }),
	});
	const json = await res.json();
	const result = json?.result ?? { columns: [], rows: [] };
	const columns: string[] = result.columns ?? [];
	const rows: any[][] = result.rows ?? [];
	return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}

/**
 * Finds the citizen who invited `addr` (i.e. trusted them — e.g. via Metri). That
 * inviter is required for registerHuman. Returns null if nobody has invited them yet.
 */
export async function findInviter(addr: string): Promise<string | null> {
	try {
		const lower = addr.toLowerCase();
		const group = roebeltalerGroupAddress.toLowerCase();
		const rows = await circlesQuery({
			Namespace: "V_Crc",
			Table: "TrustRelations",
			Columns: [],
			Filter: [{
				Type: "Conjunction", ConjunctionType: "And", Predicates: [
					{ Type: "FilterPredicate", FilterType: "Equals", Column: "version", Value: 2 },
					{ Type: "FilterPredicate", FilterType: "Equals", Column: "trustee", Value: lower },
				],
			}],
			Order: [],
		});
		// Candidates that trust us — EXCLUDING ourselves and the Röbeltaler GROUP
		// (the group trusts all citizens for collateral, but it is NOT a valid human
		// inviter — registerHuman(group) reverts with CirclesErrorOneAddressArg).
		const candidates = rows
			.map((r) => String(r.truster ?? ""))
			.filter((t) => t && t.toLowerCase() !== lower && t.toLowerCase() !== group);
		// Prefer a candidate that is a registered human (a real inviter, e.g. Metri).
		for (const c of candidates) {
			try { if (await isOnboarded(c)) return c; } catch { /* keep looking */ }
		}
		return candidates[0] ?? null;
	} catch {
		return null;
	}
}

/** True once the address is onboarded (a Circles human) — i.e. can mint daily. */
export async function isOnboarded(address: string): Promise<boolean> {
	return readContract({
		contract: hubRead,
		method: "function isHuman(address) view returns (bool)",
		params: [address],
	});
}

/** Röbel Münzen balance (demurraged ERC1155 balance of the group token). */
export async function getRoebelTalerBalance(address: string): Promise<bigint> {
	return readContract({
		contract: hubRead,
		method: "function balanceOf(address,uint256) view returns (uint256)",
		params: [address, groupTokenId],
	});
}

/** A citizen's own personal CRC (token id = uint256(self)) — the daily-claimed
 *  issuance that gets converted into Röbel Münzen. */
export async function getPersonalCrcBalance(address: string): Promise<bigint> {
	return readContract({
		contract: hubRead,
		method: "function balanceOf(address,uint256) view returns (uint256)",
		params: [address, BigInt(address)],
	});
}

/** Indicative € value of 1 Röbel Münze (orientation only — NOT euro-redeemable). */
export const MUENZE_EUR = 1;
/** Convert a Röbel Münzen amount (display number) to its indicative € value. */
export function talerToEuro(taler: number): number {
	return taler * MUENZE_EUR;
}

/**
 * How many Röbel Münzen the citizen can mint RIGHT NOW. Circles issues ~1 CRC/hour
 * continuously; `calculateIssuance` returns the accrued-but-unclaimed amount (1:1 with
 * the Münzen they'll get after conversion). 0 if not yet a human / nothing accrued.
 */
export async function getMintableTaler(address: string): Promise<bigint> {
	try {
		const res = (await readContract({
			contract: hubRead,
			method: "function calculateIssuance(address) view returns (uint256, uint256, uint256)",
			params: [address],
		})) as readonly bigint[];
		return res?.[0] ?? 0n;
	} catch {
		return 0n;
	}
}

// xDAI is USD-pegged, so its € value moves with EUR/USD. Fetch the live rate
// (10-min in-memory cache) so treasury figures match what a payout actually
// costs; fall back to the last known / an approximate rate when offline.
const XDAI_EUR_FALLBACK = 0.92;
let xdaiEurCache: { rate: number; at: number } | null = null;
async function getXdaiEurRate(): Promise<number> {
	if (xdaiEurCache && Date.now() - xdaiEurCache.at < 10 * 60 * 1000) return xdaiEurCache.rate;
	try {
		const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=xdai&vs_currencies=eur");
		const j = await res.json();
		const rate = Number(j?.xdai?.eur);
		if (Number.isFinite(rate) && rate > 0.5 && rate < 2) {
			xdaiEurCache = { rate, at: Date.now() };
			return rate;
		}
	} catch {
		/* ignore — fall back */
	}
	return xdaiEurCache?.rate ?? XDAI_EUR_FALLBACK;
}

const EURE_ADDRESS = "0xcB444e90D8198415266c6a2724b7900fb12FC56E";

/**
 * Stadtkasse fiat value in €: native xDAI (live-converted) + EURe.
 * Röbel Münzen are deliberately EXCLUDED — they are not euro-redeemable, and
 * every surface must show the same figure as the treasury details page.
 */
export async function getTreasuryEuro(address: string): Promise<number> {
	let xdai = 0;
	try {
		const res = await fetch("https://rpc.gnosischain.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
		});
		const j = await res.json();
		xdai = Number(BigInt(j?.result ?? "0x0")) / 1e18;
	} catch {
		/* ignore */
	}
	let eure = 0;
	try {
		const e = (await readContract({
			contract: getContract({ client, chain: gnosisRead, address: EURE_ADDRESS }),
			method: "function balanceOf(address) view returns (uint256)",
			params: [address],
		})) as bigint;
		eure = Number(e) / 1e18;
	} catch {
		/* ignore */
	}
	return xdai * (await getXdaiEurRate()) + eure;
}

export interface TreasuryAssets {
	/** Röbel Münzen held by the address. */
	roebel: number;
	/** Native xDAI balance. */
	xdai: number;
	/** EURe (regulated euro) balance. */
	eure: number;
	/** Fiat € total (xDAI live-converted + EURe). Röbel Münzen excluded — not euro-redeemable. */
	euroTotal: number;
}

/** Real per-asset breakdown of a treasury address (Röbel Münzen + xDAI + EURe). */
export async function getTreasuryAssets(address: string): Promise<TreasuryAssets> {
	let xdai = 0;
	try {
		const res = await fetch("https://rpc.gnosischain.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
		});
		const j = await res.json();
		xdai = Number(BigInt(j?.result ?? "0x0")) / 1e18;
	} catch {
		/* ignore */
	}
	let eure = 0;
	try {
		const e = (await readContract({
			contract: getContract({ client, chain: gnosisRead, address: EURE_ADDRESS }),
			method: "function balanceOf(address) view returns (uint256)",
			params: [address],
		})) as bigint;
		eure = Number(e) / 1e18;
	} catch {
		/* ignore */
	}
	const roebel = Number(formatTaler(await getRoebelTalerBalance(address).catch(() => 0n)));
	return { roebel, xdai, eure, euroTotal: xdai * (await getXdaiEurRate()) + eure };
}

export interface TreasuryTx {
	direction: "in" | "out" | "admin";
	/** Euro value moved (0 for admin/Safe txs). For native xDAI rows this is the
	 *  xDAI value treated 1:1 as €; for EURe transfers it's the token value. */
	amount: number;
	/** Currency of `amount`. Always euro-denominated in the UI. */
	currency: "eur";
	/** Epoch ms, 0 if unknown. */
	timestamp: number;
	/** Human label (Eingang / Ausgang / method). */
	label: string;
	/** On-chain transaction hash (for the detail screen / explorer link). */
	txHash: string;
}

/**
 * Recent on-chain transactions of a treasury address, via the Gnosis Blockscout
 * API. Includes BOTH native xDAI transactions AND EURe token transfers, so euro
 * outflows (e.g. a 50 € ad payment) show up. Addresses are deliberately NOT
 * surfaced (per the no-wallet rule) — only direction, amount and time.
 */
export async function getTreasuryTransactions(address: string): Promise<TreasuryTx[]> {
	const self = address.toLowerCase();
	const eureToken = EURE_ADDRESS.toLowerCase();
	// Same live rate as the balance calc so history rows match the total.
	const rate = await getXdaiEurRate();

	const native = (async (): Promise<TreasuryTx[]> => {
		try {
			const res = await fetch(`https://gnosis.blockscout.com/api/v2/addresses/${address}/transactions`);
			const j = await res.json();
			const items: any[] = Array.isArray(j?.items) ? j.items : [];
			return items.map((t) => {
				const to = (t?.to?.hash ?? "").toLowerCase();
				let amount = 0;
				try {
					// xDAI is USD-pegged → convert to € so the history matches the
					// total-balance calc (which applies the same live rate).
					amount = (Number(BigInt(t?.value ?? "0")) / 1e18) * rate;
				} catch {
					amount = 0;
				}
				const timestamp = t?.timestamp ? Date.parse(t.timestamp) : 0;
				const direction: "in" | "out" | "admin" = amount === 0 ? "admin" : to === self ? "in" : "out";
				const label = direction === "in" ? "Eingang" : direction === "out" ? "Ausgang" : "Verwaltung";
				return { direction, amount, currency: "eur" as const, timestamp, label, txHash: String(t?.hash ?? "") };
			});
		} catch {
			return [];
		}
	})();

	// A Safe moves native xDAI via INTERNAL transactions: the visible tx is a
	// value-0 execTransaction() call, and the actual transfer happens one call
	// frame deeper. Without this, every payout (e.g. the 50 € ad budget) is
	// invisible in the history.
	const internal = (async (): Promise<TreasuryTx[]> => {
		try {
			const res = await fetch(
				`https://gnosis.blockscout.com/api/v2/addresses/${address}/internal-transactions`
			);
			const j = await res.json();
			const items: any[] = Array.isArray(j?.items) ? j.items : [];
			return items
				.filter((t) => {
					try {
						return BigInt(t?.value ?? "0") > 0n;
					} catch {
						return false;
					}
				})
				.map((t) => {
					const to = (t?.to?.hash ?? "").toLowerCase();
					const amount = (Number(BigInt(t?.value ?? "0")) / 1e18) * rate;
					const timestamp = t?.timestamp ? Date.parse(t.timestamp) : 0;
					const direction: "in" | "out" = to === self ? "in" : "out";
					const label = direction === "in" ? "Eingang" : "Ausgang";
					return {
						direction,
						amount,
						currency: "eur" as const,
						timestamp,
						label,
						txHash: String(t?.transaction_hash ?? ""),
					};
				});
		} catch {
			return [];
		}
	})();

	const tokens = (async (): Promise<TreasuryTx[]> => {
		try {
			const res = await fetch(
				`https://gnosis.blockscout.com/api/v2/addresses/${address}/token-transfers?type=ERC-20`
			);
			const j = await res.json();
			const items: any[] = Array.isArray(j?.items) ? j.items : [];
			return items
				.filter((t) => (t?.token?.address ?? "").toLowerCase() === eureToken)
				.map((t) => {
					const to = (t?.to?.hash ?? "").toLowerCase();
					const decimals = Number(t?.token?.decimals ?? 18) || 18;
					let amount = 0;
					try {
						amount = Number(BigInt(t?.total?.value ?? "0")) / 10 ** decimals;
					} catch {
						amount = 0;
					}
					const timestamp = t?.timestamp ? Date.parse(t.timestamp) : 0;
					const direction: "in" | "out" = to === self ? "in" : "out";
					const label = direction === "in" ? "Eingang" : "Ausgang";
					return { direction, amount, currency: "eur" as const, timestamp, label, txHash: String(t?.tx_hash ?? t?.transaction_hash ?? "") };
				});
		} catch {
			return [];
		}
	})();

	try {
		const [n, i, t] = await Promise.all([native, internal, tokens]);
		// A plain transfer to the Safe can appear both as a regular tx and as the
		// top-level internal call frame — dedupe value-moves by (hash, direction,
		// amount) so it isn't listed twice.
		const seen = new Set<string>();
		const merged = [...n, ...i, ...t].filter((x) => {
			if (x.amount <= 0) return true;
			const key = `${x.txHash}:${x.direction}:${x.amount.toFixed(6)}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
	} catch {
		return [];
	}
}

/** Format an 18-decimal on-chain amount as a friendly Röbel Münzen string. */
export function formatTaler(raw: bigint): string {
	const whole = raw / 10n ** 18n;
	const frac = (raw % 10n ** 18n) / 10n ** 16n; // 2 decimals
	return `${whole}.${frac.toString().padStart(2, "0")}`;
}

/** Daily Röbel Münzen ("Heute abholen"). */
export function prepareDailyMint(): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function personalMint()",
		params: [],
	});
}

/**
 * Onboard the citizen (register as a Circles human). Requires an `inviter` — a
 * Röbel operator avatar. SEAM: the inviter must be supplied by a trusted backend
 * (the operator key is never in the app). See the circles-invite edge function.
 */
export function prepareOnboard(inviter: string): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function registerHuman(address,bytes32)",
		params: [inviter, ZERO_METADATA],
	});
}

const FAR_EXPIRY = 4102444800n; // ~year 2100 (uint96) — far-future trust expiry

/**
 * Peer-invite: a citizen trusts `addr` (the Circles "invitation"). Once trusted, that
 * address can registerHuman(citizen) and become a plain Circles human — minting their own
 * personal "Münzen" (NOT the Röbel Münzen group token). The ~96 CRC invite cost is burned
 * from the citizen when the guest registers. This does NOT grant RCRC minting (that needs a
 * CitizenNFT + the group's on-chain membership condition).
 */
export function prepareTrust(addr: string): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function trust(address,uint96)",
		params: [addr, FAR_EXPIRY],
	});
}

/** A guest's own personal Circles balance shown in-app as "Münzen" (their personal CRC). */
export async function getMuenzenBalance(address: string): Promise<bigint> {
	return getPersonalCrcBalance(address);
}

/** Contribute `amount` (18-dec) of the citizen's own daily mint to the shared Röbel Münzen. */
export function prepareContributeToRoebelTaler(self: string, amount: bigint): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function groupMint(address,address[],uint256[],bytes)",
		params: [roebeltalerGroupAddress, [self], [amount], "0x"],
	});
}

/** Send `amount` (18-dec) Röbel Münzen from `from` to `to` (ERC1155 group token). */
export function prepareSendRoebelTaler(from: string, to: string, amount: bigint): PreparedTransaction {
	return prepareContractCall({
		contract: hubWrite,
		method: "function safeTransferFrom(address,address,uint256,uint256,bytes)",
		params: [from, to, groupTokenId, amount, "0x"],
	});
}

/** Parse a user-entered Röbel Münzen amount ("12,50" or "12.5") to 18-dec bigint. */
export function parseTalerAmount(input: string): bigint {
	const clean = input.replace(",", ".").trim();
	if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return 0n;
	const [whole, frac = ""] = clean.split(".");
	const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
	return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0");
}
