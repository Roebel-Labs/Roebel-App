// apps/expo/lib/news-audio.ts
// Client for "Vorlesen": asks the web app for the article's narration MP3
// (POST /api/news/[slug]/audio). The first request per article renders it via
// ElevenLabs, which can take a while, so the timeout is generous — but there
// IS one: RN fetch never times out on its own.

const DEFAULT_API_BASE_URL = 'https://roebel.app';
const REQUEST_TIMEOUT_MS = 150_000;
// Calm narration pace; only used for the estimate shown before playback.
const SPOKEN_WORDS_PER_MINUTE = 140;

function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (env && env.length > 0) return env.replace(/\/$/, '');
  return DEFAULT_API_BASE_URL;
}

export type ArticleNarration = { url: string; durationMs: number | null };

export async function fetchArticleNarration(slug: string): Promise<ArticleNarration> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/news/${encodeURIComponent(slug)}/audio`, {
      method: 'POST',
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      url?: string;
      durationMs?: number | null;
      error?: string;
    };
    if (!res.ok || !json.url) throw new Error(json.error ?? `HTTP ${res.status}`);
    return { url: json.url, durationMs: json.durationMs ?? null };
  } finally {
    clearTimeout(timer);
  }
}

/** Whole minutes of listening, estimated from the article text (min 1). */
export function estimateListenMinutes(parts: (string | null | undefined)[]): number {
  const words = parts
    .filter(Boolean)
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / SPOKEN_WORDS_PER_MINUTE));
}

/** m:ss, or h:mm:ss past an hour. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
