// Real money movements of the Gemeinschaftskasse Safe, from Blockscout's v1
// (Etherscan-style) API. Same rules as the app (apps/expo/lib/roebel-taler.ts):
// - native xDAI = regular txs + internal CALL frames (a Safe pays out through
//   internal frames; the visible execTransaction carries value 0);
// - DELEGATECALL frames are skipped: the Safe singleton / MultiSend frame
//   mirrors the value without moving it (phantom in/out pairs);
// - reverted frames/txs moved nothing;
// - a direct transfer can show up as the regular tx AND its top-level internal
//   frame, so identical (tx, direction, value) legs are kept once;
// - EURe V2 transfers are added 1:1 in €.
// `gnosis.blockscout.com` 301s to gnosisscan.io; fetch follows it. The v2
// internal-transactions route HANGS there, so only v1 actions are used.

import { fetchJsonWithTimeout, type FetchLike } from "./rates";

export const BLOCKSCOUT_API = "https://gnosis.blockscout.com/api";
export const EURE_V2_ADDRESS = "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430";

export interface Flow {
	kind: "xdai" | "eure";
	direction: "in" | "out";
	/** Token amount (xDAI or EURe), positive. */
	amount: number;
	/** Epoch ms. */
	timestamp: number;
	txHash: string;
}

function toUnits(raw: unknown, decimals = 18): number {
	try {
		return Number(BigInt(String(raw ?? "0"))) / 10 ** decimals;
	} catch {
		return 0;
	}
}

/** Pure: Blockscout v1 `result` arrays → deduplicated flows of `address`. */
export function parseFlows(
	address: string,
	txlist: unknown,
	txlistinternal: unknown,
	tokentx: unknown,
): Flow[] {
	const self = address.toLowerCase();
	const eure = EURE_V2_ADDRESS.toLowerCase();
	const flows: Flow[] = [];
	const push = (kind: Flow["kind"], amount: number, to: string, from: string, tsSec: unknown, hash: unknown) => {
		if (!(amount > 0)) return;
		const toSelf = String(to ?? "").toLowerCase() === self;
		const fromSelf = String(from ?? "").toLowerCase() === self;
		if (!toSelf && !fromSelf) return;
		if (toSelf && fromSelf) return; // self-transfer moves nothing
		const ts = Number(tsSec ?? 0) * 1000;
		flows.push({
			kind,
			direction: toSelf ? "in" : "out",
			amount,
			timestamp: Number.isFinite(ts) ? ts : 0,
			txHash: String(hash ?? ""),
		});
	};

	for (const t of Array.isArray(txlist) ? (txlist as any[]) : []) {
		if ((t?.isError ?? "0") !== "0") continue;
		push("xdai", toUnits(t?.value), t?.to, t?.from, t?.timeStamp, t?.hash);
	}
	for (const t of Array.isArray(txlistinternal) ? (txlistinternal as any[]) : []) {
		if ((t?.callType ?? t?.type ?? "call") !== "call") continue;
		if ((t?.isError ?? "0") !== "0") continue;
		push("xdai", toUnits(t?.value), t?.to, t?.from, t?.timeStamp, t?.transactionHash ?? t?.hash);
	}
	for (const t of Array.isArray(tokentx) ? (tokentx as any[]) : []) {
		if (String(t?.contractAddress ?? "").toLowerCase() !== eure) continue;
		const decimals = Number(t?.tokenDecimal ?? 18) || 18;
		push("eure", toUnits(t?.value, decimals), t?.to, t?.from, t?.timeStamp, t?.hash);
	}

	const seen = new Set<string>();
	return flows.filter((f) => {
		const key = `${f.kind}:${f.txHash.toLowerCase()}:${f.direction}:${f.amount.toFixed(9)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Fetch + parse. Throws when a source is unreachable, so a partial history is
 * never presented as complete (the caller serves balances without history).
 * "No transactions found" (status 0, empty result) is a valid empty list.
 */
export async function fetchFlows(
	address: string,
	opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<Flow[]> {
	const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
	const timeoutMs = opts.timeoutMs ?? 15_000;
	const get = async (action: string, extra = "") => {
		const j = await fetchJsonWithTimeout(
			fetchImpl,
			`${BLOCKSCOUT_API}?module=account&action=${action}&address=${address}${extra}&sort=desc`,
			timeoutMs,
		);
		if (!Array.isArray(j?.result)) throw new Error(`blockscout ${action}: ${String(j?.message ?? "bad response")}`);
		return j.result as unknown[];
	};
	const [txlist, internal, tokens] = await Promise.all([
		get("txlist"),
		get("txlistinternal"),
		get("tokentx", `&contractaddress=${EURE_V2_ADDRESS}`),
	]);
	return parseFlows(address, txlist, internal, tokens);
}

// ── Safe Transaction Service (primary source since 2026-11-25) ───────────────
// gnosisscan.io (where gnosis.blockscout.com now redirects) answers bots with a
// Cloudflare challenge (HTTP 403), so the Blockscout path above yields nothing.
// The Safe Transaction Service lists every transfer in and out of the Safe —
// native xDAI (incl. internal frames) and ERC-20 — with its tx hash. Needs
// SAFE_API_KEY (server-only, already used by the Gemeinschaftskasse dashboard).

export const SAFE_TX_SERVICE = "https://api.safe.global/tx-service/gno/api/v1";

/** Pure: Safe Transaction Service `transfers` results → flows of `address` (xDAI + EURe only). */
export function parseSafeTransfers(address: string, results: unknown): Flow[] {
	const self = address.toLowerCase();
	const eure = EURE_V2_ADDRESS.toLowerCase();
	const flows: Flow[] = [];
	for (const t of Array.isArray(results) ? (results as any[]) : []) {
		const type = String(t?.type ?? "");
		let kind: Flow["kind"] | null = null;
		let decimals = 18;
		if (type === "ETHER_TRANSFER") kind = "xdai";
		else if (type === "ERC20_TRANSFER" && String(t?.tokenAddress ?? "").toLowerCase() === eure) {
			kind = "eure";
			decimals = Number(t?.tokenInfo?.decimals ?? 18) || 18;
		}
		if (!kind) continue;
		const amount = toUnits(t?.value, decimals);
		if (!(amount > 0)) continue;
		const toSelf = String(t?.to ?? "").toLowerCase() === self;
		const fromSelf = String(t?.from ?? "").toLowerCase() === self;
		if (toSelf === fromSelf) continue; // unrelated or self-transfer
		const ts = Date.parse(String(t?.executionDate ?? ""));
		flows.push({ kind, direction: toSelf ? "in" : "out", amount, timestamp: Number.isFinite(ts) ? ts : 0, txHash: String(t?.transactionHash ?? "") });
	}
	const seen = new Set<string>();
	return flows.filter((f) => {
		const key = `${f.kind}:${f.txHash.toLowerCase()}:${f.direction}:${f.amount.toFixed(9)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Every transfer page of the Safe (newest first). Throws when unreachable. */
export async function fetchFlowsFromSafeService(
	address: string,
	apiKey: string,
	opts: { fetchImpl?: FetchLike; timeoutMs?: number; maxPages?: number } = {},
): Promise<Flow[]> {
	const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
	const timeoutMs = opts.timeoutMs ?? 15_000;
	const results: unknown[] = [];
	let url: string | null = `${SAFE_TX_SERVICE}/safes/${address}/transfers/?limit=100`;
	for (let page = 0; url && page < (opts.maxPages ?? 10); page++) {
		const j = await fetchJsonWithTimeout(fetchImpl, url, timeoutMs, { headers: { Authorization: `Bearer ${apiKey}` } });
		if (!Array.isArray(j?.results)) throw new Error("safe tx service: bad response");
		results.push(...j.results);
		url = typeof j.next === "string" && j.next ? j.next : null;
	}
	return parseSafeTransfers(address, results);
}

/** Safe Transaction Service first (when SAFE_API_KEY is set), Blockscout as the fallback. */
export async function fetchTreasuryFlows(address: string, env: Record<string, string | undefined> = process.env): Promise<Flow[]> {
	const key = env.SAFE_API_KEY?.trim();
	if (key) {
		try {
			return await fetchFlowsFromSafeService(address, key);
		} catch (e) {
			console.error("[treasury/flows] safe tx service failed, trying blockscout", e instanceof Error ? e.message.slice(0, 120) : typeof e);
		}
	}
	return fetchFlows(address);
}
