// Circles v2 profile + recipient helpers (Gnosis). Resolves an address to its
// Circles name + avatar image (on-chain Avatar row → CIDv0 → profile service),
// and lists the citizens that accepted the Röbel Münzen invite.
import { roebeltalerGroupAddress } from "@/constants/gnosis";

const CIRCLES_RPC = "https://rpc.aboutcircles.com/";
const PROFILE_SVC = "https://rpc.aboutcircles.com/profiles/get?cid=";
const PROFILE_PIN = "https://rpc.aboutcircles.com/profiles/pin";
const ZERO_DIGEST = "0x" + "0".repeat(64);

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

function base58Decode(str: string): number[] {
	let num = 0n;
	for (const ch of str) {
		const idx = B58.indexOf(ch);
		if (idx < 0) throw new Error("invalid base58 char");
		num = num * 58n + BigInt(idx);
	}
	const bytes: number[] = [];
	while (num > 0n) {
		bytes.unshift(Number(num % 256n));
		num /= 256n;
	}
	for (let i = 0; i < str.length && str[i] === "1"; i++) bytes.unshift(0); // leading zeros
	return bytes;
}

/** CIDv0 (Qm…) → bytes32 metadata digest (0x…) by stripping the 0x1220 multihash prefix. */
export function cidV0ToDigest(cid: string): string {
	const bytes = base58Decode(cid); // 34 bytes: [0x12, 0x20, ...32 digest bytes]
	const digest = bytes.slice(2);
	if (digest.length !== 32) throw new Error("unexpected CID length");
	return "0x" + digest.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CirclesProfileInput {
	name: string;
	description?: string;
	previewImageUrl?: string;
	imageUrl?: string;
}

/** Pin a profile JSON to the Circles profile service. Returns its CIDv0. */
export async function pinCirclesProfile(profile: CirclesProfileInput): Promise<string> {
	const res = await fetch(PROFILE_PIN, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(profile),
	});
	if (!res.ok) throw new Error(`Profil-Upload fehlgeschlagen (${res.status})`);
	const json = await res.json();
	if (!json?.cid) throw new Error("Profil-Upload ohne CID");
	return json.cid as string;
}

/** The avatar's currently published metadata digest, or null if none/zero (not published). */
export async function getPublishedDigest(address: string): Promise<string | null> {
	try {
		const rows = await circlesQuery({
			Namespace: "V_CrcV2",
			Table: "Avatars",
			Columns: [],
			Filter: [{ Type: "FilterPredicate", FilterType: "Equals", Column: "avatar", Value: address.toLowerCase() }],
			Order: [],
			Limit: 1,
		});
		const d = rows[0]?.cidV0Digest as string | undefined;
		if (!d || d === ZERO_DIGEST) return null;
		return d;
	} catch {
		return null;
	}
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
