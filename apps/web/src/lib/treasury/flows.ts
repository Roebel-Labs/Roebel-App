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
