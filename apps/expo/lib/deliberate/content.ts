// Content addressing for debate texts: the chain stores contentURI = sha-256 of the
// UTF-8 text (an IPFS raw-leaves digest); the plaintext lives in Supabase
// `debate_contents`, whose digest-integrity CHECK mirrors this hashing.
import { supabase } from '../supabase';
import { MAX_CONTENT_BYTES, utf8ByteLength } from './protocol';

export type DigestImpl = (text: string) => Promise<string>;

async function expoSha256Hex(text: string): Promise<string> {
	const { CryptoDigestAlgorithm, digestStringAsync } = await import('expo-crypto');
	return digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
}

/** Lowercase sha-256 hex (no 0x) of the text's UTF-8 bytes. `impl` is injectable for tests. */
export async function sha256HexOf(text: string, impl: DigestImpl = expoSha256Hex): Promise<string> {
	return (await impl(text)).toLowerCase();
}

/** Converts a 64-char hex digest into the bytes32 the contract expects. */
export function digestToBytes32(hex: string): `0x${string}` {
	if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`not a sha-256 hex digest: ${hex}`);
	return `0x${hex}`;
}

/** Strips the 0x prefix off an on-chain contentURI for content-store lookups. */
export function bytes32ToDigest(uri: string): string {
	return uri.toLowerCase().replace(/^0x/, '');
}

/** Throws (German, user-facing) unless the text fits the protocol's 1 KiB block. */
export function assertValidContent(text: string): void {
	const bytes = utf8ByteLength(text);
	if (bytes === 0) throw new Error('Der Text darf nicht leer sein.');
	if (bytes > MAX_CONTENT_BYTES) {
		throw new Error(`Der Text ist zu lang (${bytes} von ${MAX_CONTENT_BYTES} Bytes).`);
	}
}

/** Stores the text under its digest (idempotent — an existing identical row is fine). */
export async function putDebateContent(text: string, impl?: DigestImpl): Promise<string> {
	assertValidContent(text);
	const digest = await sha256HexOf(text, impl);
	// debate_contents is not in the generated client types yet — house `as any` idiom.
	const { error } = await (supabase.from('debate_contents') as any).insert({ digest, content: text });
	if (error && error.code !== '23505') throw error;
	return digest;
}

/**
 * Batch-fetches texts by digest, re-hashing each row and dropping mismatches —
 * the store is untrusted; the digest from the chain is the truth.
 */
export async function fetchDebateContents(
	digests: string[],
	impl?: DigestImpl,
): Promise<Map<string, string>> {
	const unique = [...new Set(digests.filter((d) => /^[0-9a-f]{64}$/.test(d)))];
	const out = new Map<string, string>();
	if (unique.length === 0) return out;
	const { data, error } = await supabase
		.from('debate_contents')
		.select('digest, content')
		.in('digest', unique);
	if (error) throw error;
	const rows = (data ?? []) as { digest: string; content: string }[];
	for (const row of rows) {
		if ((await sha256HexOf(row.content, impl)) === row.digest) {
			out.set(row.digest, row.content);
		}
	}
	return out;
}
