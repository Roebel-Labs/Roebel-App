import { fileURLToPath } from 'node:url';

/** Fixed render settings for the golden images (D4 renders the app adapter with the same). */
export const GOLDEN_OPTIONS = { width: 462, mode: 'preview', shinePhase: 0.35 } as const;

export const goldenPath = (id: string) => fileURLToPath(new URL(`../test/golden/${id}.png`, import.meta.url));
