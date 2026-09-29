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
	resolveTreasuryEuro,
	TREASURY_SNAPSHOT,
	TREASURY_SNAPSHOT_ENABLED,
} from "@/constants/treasury-snapshot";
import {
	gnosis,
	gnosisRead,
	circlesHubAddress,
	roebeltalerGroupAddress,
	attesterSafeGnosisAddress,
} from "@/constants/gnosis";
import { fetchTreasuryApi, readRememberedRate, rememberRate, type TreasuryApiLink } from "@/lib/treasury-api";

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
		// Only a registered HUMAN counts as an inviter. Non-human trusters exist for
		// every citizen (e.g. the group's mint-handler ORGANIZATION trusts members as
		// minting plumbing) and registerHuman(nonHuman) always reverts on-chain with
		// CirclesErrorOneAddressArg(inviter, 160) — so never fall back to them:
		// no human truster ⇒ null ⇒ the app shows the proper "not invited yet" sheet.
		for (const c of candidates) {
			try { if (await isOnboarded(c)) return c; } catch { /* keep looking */ }
		}
		return null;
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

/** True when the Röbel Münzen group trusts `addr` — i.e. groupMint is allowed
 *  (citizens). Guests mint personal Münzen only. */
export async function isGroupMember(address: string): Promise<boolean> {
	return readContract({
		contract: hubRead,
		method: "function isTrusted(address,address) view returns (bool)",
		params: [roebeltalerGroupAddress, address],
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

const BLOCKSCOUT = "https://gnosis.blockscout.com";

/**
 * JSON fetch with a hard timeout. React Native's `fetch` has NO default
 * timeout (its OkHttp client is configured with 0 = infinite), so an endpoint
 * that accepts the connection and then never answers hangs the awaiting
 * promise FOREVER — no rejection, so no `catch` ever runs and the screen sits
 * on skeletons. Every network read in this module goes through here so a dead
 * upstream degrades into a normal rejection its caller already handles.
 */
async function fetchJson(url: string, init?: RequestInit, timeoutMs = 12_000): Promise<any> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { ...init, signal: controller.signal });
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}

// xDAI is USD-pegged, so its € value is the USD→EUR rate. The server route
// (/api/treasury) is the source of truth; this on-device rate only serves the
// fallback when that route is unreachable. There is NO hard-coded rate: when
// every source fails the last good rate (AsyncStorage) is used, and without
// one the caller shows the dated snapshot rather than a wrong figure.
let xdaiEurCache: { rate: number; at: number } | null = null;
const RATE_SOURCES: { url: string; pick: (j: any) => number }[] = [
	// ECB fixing (frankfurter.app 301s to .dev; fetch follows).
	{ url: "https://api.frankfurter.app/latest?from=USD&to=EUR", pick: (j) => Number(j?.rates?.EUR) },
	{ url: "https://open.er-api.com/v6/latest/USD", pick: (j) => Number(j?.rates?.EUR) },
	{ url: "https://api.coingecko.com/api/v3/simple/price?ids=xdai&vs_currencies=eur", pick: (j) => Number(j?.xdai?.eur) },
];
async function getXdaiEurRate(): Promise<number | null> {
	if (xdaiEurCache && Date.now() - xdaiEurCache.at < 10 * 60 * 1000) return xdaiEurCache.rate;
	for (const src of RATE_SOURCES) {
		try {
			const rate = src.pick(await fetchJson(src.url, undefined, 8000));
			if (Number.isFinite(rate) && rate > 0.5 && rate < 2) {
				xdaiEurCache = { rate, at: Date.now() };
				void rememberRate(rate);
				return rate;
			}
		} catch {
			/* next source */
		}
	}
	return xdaiEurCache?.rate ?? (await readRememberedRate());
}

// Monerium EURe V2 on Gnosis (V1 0xcB444e90… is deprecated; IBAN mints target V2).
const EURE_ADDRESS = "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430";

/** A real native-xDAI movement of the treasury (phantom frames excluded). */
type NativeFlow = { direction: "in" | "out"; xdai: number; timestamp: number; txHash: string };

/**
 * Every real native-xDAI transfer of `address`, from Blockscout. Merges
 * regular transactions with internal ones — a Safe pays out via internal
 * CALL frames (the visible tx is a value-0 execTransaction). DELEGATECALL
 * frames are skipped: a MultiSend batch mirrors the tx value in its frame
 * without actually moving it, which would fabricate phantom in/out pairs.
 */
async function fetchNativeFlows(address: string): Promise<NativeFlow[]> {
	// A 30 s shared promise avoids duplicate Blockscout hits per screen.
	const cached = nativeFlowsCache;
	if (cached && cached.key === address.toLowerCase() && Date.now() - cached.at < 30_000) {
		return cached.promise;
	}
	const promise = fetchNativeFlowsUncached(address);
	nativeFlowsCache = { key: address.toLowerCase(), at: Date.now(), promise };
	return promise;
}
let nativeFlowsCache: { key: string; at: number; promise: Promise<NativeFlow[]> } | null = null;

async function fetchNativeFlowsUncached(address: string): Promise<NativeFlow[]> {
	const self = address.toLowerCase();
	// `gnosis.blockscout.com` now 301s to gnosisscan.io, whose v2
	// `/internal-transactions` route accepts the connection and never responds.
	// The v1 (Etherscan-style) `txlistinternal` action still serves them. Each
	// source falls back to empty on its own — with Promise.all a single dead
	// endpoint took the whole flow list (balance AND history) down with it.
	const [nat, intl] = await Promise.all([
		fetchJson(`${BLOCKSCOUT}/api/v2/addresses/${address}/transactions`).catch(() => null),
		fetchJson(`${BLOCKSCOUT}/api?module=account&action=txlistinternal&address=${address}`).catch(
			() => null,
		),
	]);
	const flows: NativeFlow[] = [];
	const push = (rawValue: string, toHash: string, tsMs: number, txHash: string) => {
		let v = 0;
		try {
			v = Number(BigInt(rawValue || "0")) / 1e18;
		} catch {
			return;
		}
		if (v <= 0) return;
		flows.push({
			direction: toHash.toLowerCase() === self ? "in" : "out",
			xdai: v,
			timestamp: Number.isFinite(tsMs) ? tsMs : 0,
			txHash,
		});
	};
	for (const t of Array.isArray(nat?.items) ? nat.items : []) {
		push(t?.value, t?.to?.hash ?? "", t?.timestamp ? Date.parse(t.timestamp) : 0, String(t?.hash ?? ""));
	}
	// v1 rows are flat: `to` is a plain address, `timeStamp` is unix SECONDS, and
	// the call kind lives in `callType` (v2 put it in `type`). Reverted frames
	// moved nothing, so drop them too.
	for (const t of Array.isArray(intl?.result) ? intl.result : []) {
		if ((t?.callType ?? t?.type ?? "call") !== "call") continue;
		if ((t?.isError ?? "0") !== "0") continue;
		push(t?.value, t?.to ?? "", Number(t?.timeStamp ?? 0) * 1000, String(t?.transactionHash ?? ""));
	}
	// A direct transfer can appear both as the regular tx and as its top-level
	// internal frame — keep one.
	const seen = new Set<string>();
	return flows.filter((f) => {
		const key = `${f.txHash}:${f.direction}:${f.xdai.toFixed(9)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** /api/treasury serves exactly one address: the Gemeinschaftskasse Safe. */
function isTreasurySafe(address: string): boolean {
	return address.toLowerCase() === attesterSafeGnosisAddress.toLowerCase();
}

/**
 * Live on-chain € value of the treasury: native xDAI × today's xDAI/EUR rate +
 * EURe (1:1). Röbel Münzen are deliberately EXCLUDED — they are not
 * euro-redeemable. `liveEuro` is null when the xDAI balance could not be read
 * at all, so callers fall back to the dated snapshot for a FAILED read only.
 */
async function readTreasuryLive(
	address: string,
): Promise<{ xdai: number; eure: number; liveEuro: number | null }> {
	let xdai: number | null = null;
	try {
		const j = await fetchJson("https://rpc.gnosischain.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
		});
		if (typeof j?.result === "string") xdai = Number(BigInt(j.result)) / 1e18;
	} catch {
		/* ignore — unreadable */
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
	if (xdai === null) return { xdai: 0, eure, liveEuro: null };
	const rate = await getXdaiEurRate();
	// No rate anywhere (first launch, every source down): unknowable, not 0 €.
	if (rate === null) return { xdai, eure, liveEuro: null };
	return { xdai, eure, liveEuro: xdai * rate + eure };
}

/**
 * Stadtkasse fiat value in €: live xDAI × current rate + EURe (Röbel Münzen
 * excluded). Every surface shows the same figure as the treasury details page.
 */
export async function getTreasuryEuro(address: string): Promise<number> {
	if (isTreasurySafe(address)) {
		const api = await fetchTreasuryApi();
		if (api) return resolveTreasuryEuro(api.euroTotal).euro;
	}
	const { liveEuro } = await readTreasuryLive(address);
	// Never surface 0 € while the treasury is mid-move: fall back to the dated
	// snapshot (see constants/treasury-snapshot.ts).
	return resolveTreasuryEuro(liveEuro).euro;
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
	/** true = `euroTotal` is the dated snapshot, not a live chain read. */
	fromSnapshot: boolean;
}

/** Real per-asset breakdown of a treasury address (Röbel Münzen + xDAI + EURe). */
export async function getTreasuryAssets(address: string): Promise<TreasuryAssets> {
	const roebelP = getRoebelTalerBalance(address).catch(() => 0n);
	const api = isTreasurySafe(address) ? await fetchTreasuryApi() : null;
	if (api) {
		const resolved = resolveTreasuryEuro(api.euroTotal);
		return {
			roebel: Number(formatTaler(await roebelP)),
			xdai: resolved.fromSnapshot ? TREASURY_SNAPSHOT.xdai : api.xdai,
			eure: resolved.fromSnapshot ? TREASURY_SNAPSHOT.eure : api.eure,
			euroTotal: resolved.euro,
			fromSnapshot: resolved.fromSnapshot,
		};
	}
	const [{ xdai, eure, liveEuro }, roebelRaw] = await Promise.all([readTreasuryLive(address), roebelP]);
	const roebel = Number(formatTaler(roebelRaw));
	const resolved = resolveTreasuryEuro(liveEuro);
	return {
		roebel,
		xdai: resolved.fromSnapshot ? TREASURY_SNAPSHOT.xdai : xdai,
		eure: resolved.fromSnapshot ? TREASURY_SNAPSHOT.eure : eure,
		euroTotal: resolved.euro,
		fromSnapshot: resolved.fromSnapshot,
	};
}

/** The assets object used when the chain cannot be read at all. */
export function treasuryAssetsFallback(): TreasuryAssets {
	if (!TREASURY_SNAPSHOT_ENABLED) {
		return { roebel: 0, xdai: 0, eure: 0, euroTotal: 0, fromSnapshot: false };
	}
	return {
		roebel: TREASURY_SNAPSHOT.roebel,
		xdai: TREASURY_SNAPSHOT.xdai,
		eure: TREASURY_SNAPSHOT.eure,
		euroTotal: TREASURY_SNAPSHOT.euroTotal,
		fromSnapshot: true,
	};
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
	/** Where the tx was decided (proposal) or announced (post); server rows only. */
	link?: TreasuryApiLink | null;
}

/**
 * The treasury history for the screen. `curated: true` = rows straight from
 * /api/treasury (hidden txs removed, balancing row applied, each row valued at
 * its own day's rate, sums to the server total): render them as they are.
 * `curated: false` = the on-device fallback, which the screen still curates.
 */
export async function getTreasuryHistory(
	address: string,
): Promise<{ rows: TreasuryTx[]; curated: boolean }> {
	if (isTreasurySafe(address)) {
		const api = await fetchTreasuryApi();
		if (api && api.historyAvailable) {
			return {
				curated: true,
				rows: api.history.map((h) => ({
					direction: h.direction,
					amount: h.euro,
					currency: "eur" as const,
					timestamp: h.timestamp,
					label: h.label,
					txHash: h.txHash,
					link: h.link,
				})),
			};
		}
	}
	return { rows: await getTreasuryTransactions(address), curated: false };
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

	// Real native flows (regular + internal CALL frames, phantoms excluded).
	// FALLBACK ONLY (the server values each row at its own day's rate): here
	// every row uses today's rate — one lookup, not one per row, so the list
	// can't hang on a rate-limited history API. The screen's balancing row
	// closes the gap to the hero. Without any rate the xDAI rows are left out
	// rather than shown with an invented value.
	const native = (async (): Promise<TreasuryTx[]> => {
		try {
			const [flows, rate] = await Promise.all([fetchNativeFlows(address), getXdaiEurRate()]);
			if (rate === null) return [];
			return flows.map((f) => ({
				direction: f.direction,
				amount: f.xdai * rate,
				currency: "eur" as const,
				timestamp: f.timestamp,
				label: f.direction === "in" ? "Eingang" : "Ausgang",
				txHash: f.txHash,
			}));
		} catch {
			return [];
		}
	})();

	const tokens = (async (): Promise<TreasuryTx[]> => {
		try {
			const j = await fetchJson(
				`${BLOCKSCOUT}/api/v2/addresses/${address}/token-transfers?type=ERC-20`
			);
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
		const [n, t] = await Promise.all([native, tokens]);
		return [...n, ...t].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
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
