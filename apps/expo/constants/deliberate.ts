// Deliberate protocol deployment on Gnosis (test env 2026-09-02, pinned commit 0392bd43).
// Spec: docs/superpowers/specs/2026-09-02-deliberate-debates-test-env-design.md
import { getContract } from 'thirdweb';

import { client } from './thirdweb';
import { gnosis, gnosisRead } from './gnosis';

export const DELIBERATE_ADDRESS =
	process.env.EXPO_PUBLIC_DELIBERATE_ADDRESS ||
	'0xB208C359a206a0c35a7D4D99dEF63d9F6143DE9b';

/** CirclesIdentityRegistry anchored on the Röbeltaler group (members-only debates). */
export const ROEBEL_DEBATE_REGISTRY =
	process.env.EXPO_PUBLIC_DELIBERATE_REGISTRY ||
	'0xD1d6d0c8fd4D232D810FF920c802d748537E14Fe';

/** The zero registry leaves a debate open to everyone. */
export const OPEN_REGISTRY_ZERO = '0x0000000000000000000000000000000000000000';

export const deliberateContract = getContract({
	client,
	address: DELIBERATE_ADDRESS,
	chain: gnosis,
});

export const deliberateReadContract = getContract({
	client,
	address: DELIBERATE_ADDRESS,
	chain: gnosisRead,
});

export const DEFAULT_FEE_PERCENT = 5;

/** Town-default debate schedule (seconds): 1 d locking, 7 d editing, 3 d rating. */
export const DEFAULT_DURATIONS = { locking: 86_400, editing: 604_800, rating: 259_200 };

/** Schedule presets offered in the creation screen. */
export const DURATION_PRESETS = [
	{ key: 'standard', label: 'Standard: 1 Tag Sperre · 7 Tage Bearbeitung · 3 Tage Bewertung', ...DEFAULT_DURATIONS },
	{ key: 'kompakt', label: 'Kompakt: 12 Std. · 3 Tage · 2 Tage', locking: 43_200, editing: 259_200, rating: 172_800 },
	{ key: 'schnell', label: 'Schnelltest: 10 Min. · 1 Std. · 1 Std.', locking: 600, editing: 3_600, rating: 3_600 },
] as const;
