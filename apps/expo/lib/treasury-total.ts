/**
 * The one Gemeinschaftskasse total. The detail page (/treasury) and the Austausch preview card
 * both read it here, so they always show the same figure: snapshot-first server payload
 * (cache → Supabase → /api/treasury), else the on-device chain read under a deadline, else the
 * dated snapshot. Whole cents, like the page's balanced history.
 */
import {
	getTreasuryAssets,
	treasuryAssetsFallback,
	treasuryAssetsFromApi,
	type TreasuryAssets,
} from "@/lib/roebel-taler";
import { loadTreasuryProgressive, type TreasuryApiResponse } from "@/lib/treasury-api";
import { toCents } from "@/lib/treasury-history";
import { attesterSafeGnosisAddress } from "@/constants/gnosis";

/** Give up on the chain after this and show the snapshot rather than a spinner. */
export const TREASURY_LOAD_TIMEOUT_MS = 20000;

/** The euro figure both screens print (whole cents). */
export function treasuryTotalEuro(assets: TreasuryAssets): number {
	return toCents(assets.euroTotal) / 100;
}

/**
 * Streams the treasury assets: every server payload as it arrives, then the chain fallback if the
 * server had nothing. `onApi` also receives the raw payload (the page needs its history).
 * `done` resolves with the last server payload, or null when there was none (the chain read then runs).
 */
export function watchTreasuryAssets(
	onAssets: (assets: TreasuryAssets) => void,
	onApi?: (api: TreasuryApiResponse) => void,
): { stop: () => void; done: Promise<TreasuryApiResponse | null> } {
	let cancelled = false;
	// `done` = the server answer only, so the page's history fallback can start alongside the chain read.
	const done = loadTreasuryProgressive((api) => {
		if (cancelled) return;
		onAssets(treasuryAssetsFromApi(api));
		onApi?.(api);
	}).catch(() => null);
	done.then(async (final) => {
		if (cancelled || final) return;
		const assets = await Promise.race([
			getTreasuryAssets(attesterSafeGnosisAddress, { skipApi: true }),
			new Promise<TreasuryAssets>((resolve) =>
				setTimeout(() => resolve(treasuryAssetsFallback()), TREASURY_LOAD_TIMEOUT_MS),
			),
		]).catch(() => treasuryAssetsFallback());
		if (!cancelled) onAssets(assets);
	});
	return { stop: () => { cancelled = true; }, done };
}
