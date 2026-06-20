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

const XDAI_EUR = 0.92; // approx USD→EUR (xDAI is USD-pegged); indicative only
const EURE_ADDRESS = "0xcB444e90D8198415266c6a2724b7900fb12FC56E";

/** Stadtkasse value in € (indicative): native xDAI + EURe + Röbel Münzen, converted. */
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
	const rt = Number(formatTaler(await getRoebelTalerBalance(address).catch(() => 0n)));
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
	return xdai * XDAI_EUR + eure + rt;
}

export interface TreasuryAssets {
	/** Röbel Münzen held by the address. */
	roebel: number;
	/** Native xDAI balance. */
	xdai: number;
	/** EURe (regulated euro) balance. */
	eure: number;
	/** Indicative € total (xDAI→€ + EURe + Röbel Münzen). */
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
	return { roebel, xdai, eure, euroTotal: xdai * XDAI_EUR + eure + roebel };
}

export interface TreasuryTx {
	direction: "in" | "out" | "admin";
	/** xDAI amount moved (0 for admin/Safe txs). */
	xdai: number;
	/** Epoch ms, 0 if unknown. */
	timestamp: number;
	/** Human label (Eingang / Ausgang / method). */
	label: string;
}

/**
 * Recent on-chain transactions of a treasury address, via the Gnosis Blockscout
 * API. Addresses are deliberately NOT surfaced (per the no-wallet rule) — only
 * direction, amount and time.
 */
export async function getTreasuryTransactions(address: string): Promise<TreasuryTx[]> {
	try {
		const res = await fetch(`https://gnosis.blockscout.com/api/v2/addresses/${address}/transactions`);
		const j = await res.json();
		const items: any[] = Array.isArray(j?.items) ? j.items : [];
		const self = address.toLowerCase();
		return items.slice(0, 12).map((t) => {
			const to = (t?.to?.hash ?? "").toLowerCase();
			let xdai = 0;
			try {
				xdai = Number(BigInt(t?.value ?? "0")) / 1e18;
			} catch {
				xdai = 0;
			}
			const timestamp = t?.timestamp ? Date.parse(t.timestamp) : 0;
			const direction: "in" | "out" | "admin" = xdai === 0 ? "admin" : to === self ? "in" : "out";
			const label = direction === "in" ? "Eingang" : direction === "out" ? "Ausgang" : "Verwaltung";
			return { direction, xdai, timestamp, label };
		});
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
