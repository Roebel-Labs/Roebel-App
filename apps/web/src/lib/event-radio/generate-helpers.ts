// apps/web/src/lib/event-radio/generate-helpers.ts
/** Parallel ElevenLabs requests: default 2, clamped to 1..5 (Starter allows 3, Creator 5). */
export function concurrencyFromEnv(env: Record<string, string | undefined>): number {
  const raw = env.ELEVENLABS_CONCURRENCY;
  if (raw === undefined || raw.trim() === "") return 2;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(5, Math.floor(n)));
}
