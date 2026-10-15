/**
 * Hören — short stories, audiobooks and podcasts with a timed transcript.
 *
 * Tables `audio_shows` / `audio_episodes` (migration 20261015_audio_content);
 * RLS only exposes published rows of published series. Content is managed
 * at /admin/dashboard/hoeren.
 */
import { supabase } from '@/lib/supabase';

export type AudioKind = 'short_story' | 'audiobook' | 'podcast';

export type TranscriptSegment = { start: number; end: number; text: string };

export type AudioShow = {
  id: string;
  slug: string | null;
  kind: AudioKind;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  accent_color: string | null;
  language: string;
};

export type AudioEpisode = {
  id: string;
  show_id: string;
  episode_number: number | null;
  title: string;
  description: string | null;
  cover_url: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  transcript: TranscriptSegment[];
  published_at: string | null;
};

export type AudioShowWithEpisodes = AudioShow & { episodes: AudioEpisode[] };

export const AUDIO_KIND_LABEL: Record<AudioKind, string> = {
  short_story: 'Kurzgeschichte',
  audiobook: 'Hörbuch',
  podcast: 'Podcast',
};

export const AUDIO_LANGUAGE_LABEL: Record<string, string> = {
  de: 'Deutsch',
  nds: 'Plattdeutsch',
  en: 'Englisch',
};

/** Fallback player tint when the series has no accent colour. */
export const DEFAULT_AUDIO_ACCENT = '#2A1D15';

const SHOW_COLUMNS = 'id, slug, kind, title, author, description, cover_url, accent_color, language';
// The rail only needs counts + durations; the transcript is fetched with the series.
const EPISODE_LIST_COLUMNS =
  'id, show_id, episode_number, title, description, cover_url, audio_url, duration_seconds, published_at';

/**
 * Published series that have at least one published episode. A missing table
 * (migration not applied yet) yields [] so the rail simply stays hidden.
 */
export async function fetchAudioShows(): Promise<AudioShowWithEpisodes[]> {
  const { data, error } = await supabase
    .from('audio_shows')
    .select(`${SHOW_COLUMNS}, episodes:audio_episodes(${EPISODE_LIST_COLUMNS})`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(30); // LIMIT
  if (error) {
    console.warn('[audio-content] fetchAudioShows failed:', error.message);
    return [];
  }
  return ((data ?? []) as unknown as AudioShowWithEpisodes[])
    .map((show) => ({
      ...show,
      episodes: (show.episodes ?? []).map((e) => ({ ...e, transcript: [] })).sort(byEpisodeOrder),
    }))
    .filter((show) => show.episodes.length > 0);
}

export async function fetchAudioShow(id: string): Promise<AudioShowWithEpisodes | null> {
  const { data, error } = await supabase
    .from('audio_shows')
    .select(`${SHOW_COLUMNS}, episodes:audio_episodes(${EPISODE_LIST_COLUMNS}, transcript)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const show = data as unknown as AudioShowWithEpisodes;
  return {
    ...show,
    episodes: (show.episodes ?? [])
      .map((e) => ({ ...e, transcript: Array.isArray(e.transcript) ? e.transcript : [] }))
      .sort(byEpisodeOrder),
  };
}

function byEpisodeOrder(a: AudioEpisode, b: AudioEpisode): number {
  const an = a.episode_number ?? Number.MAX_SAFE_INTEGER;
  const bn = b.episode_number ?? Number.MAX_SAFE_INTEGER;
  if (an !== bn) return an - bn;
  return (a.published_at ?? '').localeCompare(b.published_at ?? '');
}

/** Newest episode by publish date — what "Neueste Folge" plays for podcasts. */
export function latestEpisode(episodes: AudioEpisode[]): AudioEpisode | null {
  if (episodes.length === 0) return null;
  return [...episodes].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))[0];
}

/**
 * Index of the segment the playhead is in (last segment whose start has
 * passed), or -1 before the first one. Binary search: runs 4×/s on long
 * audiobook transcripts.
 */
export function findActiveSegment(segments: TranscriptSegment[], seconds: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= seconds + 0.05) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function formatPlayerClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** "36 Min." / "1 Std. 12 Min." */
export function formatListenLength(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export function formatRelativeDay(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return `Vor ${days} Tagen`;
  return then.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Mixes a hex colour towards black (amount 0..1). Used for the player gradient. */
export function shadeHex(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
