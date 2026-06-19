// Circles v2 profile + recipient helpers (Gnosis). Resolves an address to its
// Circles name + avatar image (on-chain Avatar row → CIDv0 → profile service),
// and lists the citizens that accepted the Röbel Münzen invite.
import { roebeltalerGroupAddress } from "@/constants/gnosis";

const CIRCLES_RPC = "https://rpc.aboutcircles.com/";
const PROFILE_SVC = "https://rpc.aboutcircles.com/profiles/get?cid=";

/** The user's personal Metri Circles wallet (town inviter), pinned first in Senden. */
export const METRI_WALLET = "0x1f14C82926227d948b9a756Db9aEB77fe51273c3";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: number[]): string {
	let zeros = 0;
	while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
	let num = 0n;
	for (const b of bytes) num = num * 256n + BigInt(b);
	let out = "";
	while (num > 0n) {
		out = B58[Number(num % 58n)] + out;
		num /= 58n;
	}
	return "1".repeat(zeros) + out;
}

/** sha2-256 multihash digest hex → CIDv0 (Qm…). */
function digestToCidV0(hex: string): string {
	const h = hex.replace(/^0x/, "");
	const bytes = [0x12, 0x20];
	for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
	return base58(bytes);
}

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

export interface CirclesProfile {
	address: string;
	name: string | null;
	imageUrl: string | null;
	/** True if the address is a registered Circles avatar (accepted the invite). */
	registered: boolean;
}

/** Resolve a Circles name + avatar image for an address. */
export async function getCirclesProfile(address: string): Promise<CirclesProfile> {
	const addr = address.toLowerCase();
	try {
		const rows = await circlesQuery({
			Namespace: "V_CrcV2",
			Table: "Avatars",
			Columns: [],
			Filter: [{ Type: "FilterPredicate", FilterType: "Equals", Column: "avatar", Value: addr }],
			Order: [],
			Limit: 1,
		});
		if (!rows.length) return { address: addr, name: null, imageUrl: null, registered: false };
		const row = rows[0];
		let name: string | null = (row.name as string) ?? null;
		let imageUrl: string | null = null;
		const digest = row.cidV0Digest as string | undefined;
		if (digest) {
			try {
				const cid = digestToCidV0(digest);
				const p = await fetch(`${PROFILE_SVC}${cid}`).then((r) => r.json());
				name = p?.name ?? name;
				imageUrl = p?.imageUrl || p?.previewImageUrl || null;
			} catch {
				/* keep on-chain name */
			}
		}
		return { address: addr, name, imageUrl, registered: true };
	} catch {
		return { address: addr, name: null, imageUrl: null, registered: false };
	}
}

export interface Recipient extends CirclesProfile {
	isMetri: boolean;
}

/**
 * Citizens that accepted the Röbel Münzen invite (registered Circles humans the
 * group trusts), with the user's own Metri wallet pinned first. Excludes `self`.
 */
export async function getRoebelRecipients(self?: string): Promise<Recipient[]> {
	const ex = (self ?? "").toLowerCase();
	const group = roebeltalerGroupAddress.toLowerCase();
	let trustees: string[] = [];
	try {
		const rows = await circlesQuery({
			Namespace: "V_Crc",
			Table: "TrustRelations",
			Columns: ["trustee"],
			Filter: [{ Type: "FilterPredicate", FilterType: "Equals", Column: "truster", Value: group }],
			Order: [],
			Limit: 50,
		});
		trustees = rows.map((r) => String(r.trustee ?? "").toLowerCase());
	} catch {
		/* ignore */
	}
	const seen = new Set<string>();
	const candidates = [METRI_WALLET.toLowerCase(), ...trustees]
		.filter((a) => {
			if (!a || a === ex || a === group) return false;
			if (seen.has(a)) return false;
			seen.add(a);
			return true;
		})
		.slice(0, 16);
	const profiles = await Promise.all(candidates.map((a) => getCirclesProfile(a)));
	return profiles
		.filter((p) => p.registered)
		.map((p) => ({ ...p, isMetri: p.address === METRI_WALLET.toLowerCase() }));
}
