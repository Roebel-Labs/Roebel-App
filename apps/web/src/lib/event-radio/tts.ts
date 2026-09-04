// apps/web/src/lib/event-radio/tts.ts
// ElevenLabs text to speech through plain fetch (no SDK: keeps the Vercel
// bundle small, and the with-timestamps endpoint is a single JSON POST).
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps

export const TTS_MODEL_ID = "eleven_multilingual_v2";
export const TTS_OUTPUT_FORMAT = "mp3_44100_128";
export const TTS_SEED = 4242;
export const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
} as const;

// ElevenLabs accepts 0.7 to 1.2 for `speed`; anything outside is rejected.
export const SPEED_MIN = 0.7;
export const SPEED_MAX = 1.2;
export const DEFAULT_SPEED = 1.0;

export function clampSpeed(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SPEED;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(n * 100) / 100));
}

const ELEVEN_BASE_URL = "https://api.elevenlabs.io";
const MAX_RETRIES = 2;

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "TtsError";
  }
}

export type TtsResult = { audio: Buffer; durationMs: number; requestId: string | null };

type Alignment = { character_end_times_seconds?: number[] } | null | undefined;

export function durationFromAlignment(alignment: Alignment, audioBytes: number): number {
  const ends = alignment?.character_end_times_seconds;
  if (ends && ends.length > 0) return Math.ceil(ends[ends.length - 1] * 1000);
  return Math.ceil(((audioBytes * 8) / 128_000) * 1000);
}

export async function synthesizeSpeech(input: {
  text: string;
  voiceId: string;
  apiKey: string;
  previousText?: string;
  speed?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<TtsResult> {
  const doFetch = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const url = `${ELEVEN_BASE_URL}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=${TTS_OUTPUT_FORMAT}`;
  const body = JSON.stringify({
    text: input.text,
    model_id: TTS_MODEL_ID,
    previous_text: input.previousText,
    voice_settings: { ...VOICE_SETTINGS, speed: clampSpeed(input.speed ?? DEFAULT_SPEED) },
    seed: TTS_SEED,
    apply_text_normalization: "auto",
  });

  let lastError: TtsError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { "xi-api-key": input.apiKey, "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      lastError = new TtsError(`ElevenLabs nicht erreichbar: ${(err as Error).message}`, null);
      continue;
    }
    if (res.ok) {
      const json = (await res.json()) as { audio_base64?: string; alignment?: Alignment };
      if (!json.audio_base64) throw new TtsError("ElevenLabs: audio_base64 fehlt in der Antwort", res.status);
      const audio = Buffer.from(json.audio_base64, "base64");
      return {
        audio,
        durationMs: durationFromAlignment(json.alignment, audio.length),
        requestId: res.headers.get("request-id"),
      };
    }
    const text = await res.text().catch(() => "");
    lastError = new TtsError(`ElevenLabs ${res.status}: ${text.slice(0, 200)}`, res.status);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable) break;
  }
  throw lastError ?? new TtsError("ElevenLabs: unbekannter Fehler", null);
}
