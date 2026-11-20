// Pure helpers for kie.ai audio and video jobs (no I/O, no server-only) so they stay
// unit-testable. All three kinds run on the unified job endpoint
// (/api/v1/jobs/createTask + recordInfo), the same one the image path uses, so the
// kie-proxy edge function forwards them unchanged.
// Docs: https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2
//       https://docs.kie.ai/suno-api/generate-music
//       https://docs.kie.ai/market/bytedance/v1-lite-text-to-video

export type MediaKind = "speech" | "music" | "video";

export const SPEECH_MODEL = "elevenlabs/text-to-speech-multilingual-v2";
export const MUSIC_MODEL = "ai-music-api/generate";
export const MUSIC_ENGINE = "V6";
export const VIDEO_TEXT_MODEL = "bytedance/v1-lite-text-to-video";
export const VIDEO_IMAGE_MODEL = "bytedance/v1-lite-image-to-video";

/** kie.ai limit for one speech request. */
export const SPEECH_MAX_CHARS = 5000;
export const MUSIC_PROMPT_MAX_CHARS = 3000;

/** Voices offered to the assistant, by the name kie.ai lists them under. */
export const SPEECH_VOICES = {
  lutz: "9yzdeviXkFddZ4Oz8Mok",
  leon: "MJ0RnG71ty4LH3dvNfSd",
  emma: "pPdl9cQBQq4p6mRkZy2Z",
  laura: "FGY2WhTYpPnrIDTdsKH5",
  brian: "nPczCjzI2devNBz1zQrb",
} as const;
export type SpeechVoice = keyof typeof SPEECH_VOICES;
export const SPEECH_VOICE_NAMES = Object.keys(SPEECH_VOICES) as [SpeechVoice, ...SpeechVoice[]];
export const DEFAULT_SPEECH_VOICE: SpeechVoice = "lutz";

export const VIDEO_ASPECTS = ["16:9", "9:16", "1:1"] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];
export const VIDEO_DURATIONS = ["5", "10"] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export function buildSpeechPayload(input: { text: string; voice?: SpeechVoice; speed?: number }): Record<string, unknown> {
  const speed = Math.min(1.2, Math.max(0.7, input.speed ?? 1));
  return {
    model: SPEECH_MODEL,
    input: {
      text: input.text.slice(0, SPEECH_MAX_CHARS),
      voice: SPEECH_VOICES[input.voice ?? DEFAULT_SPEECH_VOICE],
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed,
      timestamps: false,
      previous_text: "",
      next_text: "",
      // Multilingual v2 rejects a language code; the language follows the text.
      language_code: "",
    },
  };
}

export function buildMusicPayload(input: { prompt: string; instrumental?: boolean }): Record<string, unknown> {
  return {
    model: MUSIC_MODEL,
    input: {
      custom_mode: false,
      instrumental: input.instrumental ?? false,
      model: MUSIC_ENGINE,
      prompt: input.prompt.slice(0, MUSIC_PROMPT_MAX_CHARS),
    },
  };
}

export function buildVideoPayload(input: {
  prompt: string; aspect?: VideoAspect; duration?: VideoDuration; imageUrl?: string | null;
}): Record<string, unknown> {
  const shared = {
    prompt: input.prompt,
    resolution: "720p",
    duration: input.duration ?? "5",
    camera_fixed: false,
    seed: -1,
    enable_safety_checker: true,
    nsfw_checker: true,
  };
  if (input.imageUrl) {
    // Image-to-video takes the frame's own aspect ratio; there is no aspect_ratio parameter.
    return { model: VIDEO_IMAGE_MODEL, input: { ...shared, image_url: input.imageUrl, end_image_url: "" } };
  }
  return { model: VIDEO_TEXT_MODEL, input: { ...shared, aspect_ratio: input.aspect ?? "16:9" } };
}

export type MediaJobState =
  | { state: "pending" }
  | { state: "success"; urls: string[]; credits: number | null }
  | { state: "fail"; error: string };

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && /^https:\/\//.test(v);
}

/** Result URLs from either shape kie.ai returns: `resultUrls` (speech, video) or track objects (music). */
function collectUrls(source: unknown): string[] {
  if (!source || typeof source !== "object") return [];
  const obj = source as { resultUrls?: unknown; data?: unknown };
  const out: string[] = [];
  if (Array.isArray(obj.resultUrls)) out.push(...obj.resultUrls.filter(isHttpsUrl));
  if (Array.isArray(obj.data)) {
    for (const track of obj.data) {
      const url = (track as { audio_url?: unknown } | null)?.audio_url;
      if (isHttpsUrl(url)) out.push(url);
    }
  }
  return out;
}

/** Interpret a `recordInfo` response body for an audio or video job. Pure. */
export function parseMediaJob(json: unknown): MediaJobState {
  const data = (json as { data?: Record<string, unknown> } | null)?.data;
  const state = data?.state;
  if (state === "success") {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(String(data?.resultJson ?? "null"));
    } catch {
      parsed = null;
    }
    const urls = [...collectUrls(parsed), ...collectUrls(data?.response)];
    const unique = [...new Set(urls)];
    if (unique.length === 0) return { state: "fail", error: "Kein Ergebnis in der Antwort." };
    const credits = typeof data?.creditsConsumed === "number" ? data.creditsConsumed : null;
    return { state: "success", urls: unique, credits };
  }
  if (state === "fail") return { state: "fail", error: String(data?.failMsg || "Generierung fehlgeschlagen.") };
  return { state: "pending" };
}

/** Handle the assistant passes back to media_status: "<kind>:<taskId>". */
export function encodeJobId(kind: MediaKind, taskId: string): string {
  return `${kind}:${taskId}`;
}

export function decodeJobId(jobId: string): { kind: MediaKind; taskId: string } | null {
  const m = /^(speech|music|video):([A-Za-z0-9_-]{6,128})$/.exec(jobId.trim());
  return m ? { kind: m[1] as MediaKind, taskId: m[2] } : null;
}

export function mediaExtension(kind: MediaKind): "mp3" | "mp4" {
  return kind === "video" ? "mp4" : "mp3";
}

export function mediaContentType(kind: MediaKind): string {
  return kind === "video" ? "video/mp4" : "audio/mpeg";
}

// ---- AI Act marking for MP3 ------------------------------------------------------------

function syncsafe(n: number): number[] {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
}

function ascii(text: string): number[] {
  // ISO-8859-1 frame encoding: keep printable ASCII only.
  return [...text].map((c) => c.charCodeAt(0)).filter((code) => code >= 0x20 && code < 0x7f);
}

function id3Frame(id: string, body: number[]): number[] {
  const size = body.length;
  return [...ascii(id), (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff, 0, 0, ...body];
}

/**
 * Writes a machine-readable "AI generated" marking into an MP3 as an ID3v2.3 tag
 * (AI Act Art. 50(2)), replacing a tag the provider may have set. Returns the input
 * unchanged with marked = false when the bytes are not an MP3 stream.
 */
export function markSyntheticMp3(bytes: Uint8Array, generator: string): { bytes: Uint8Array; marked: boolean } {
  let audio = bytes;
  const hasTag = bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  if (hasTag) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    if (10 + size >= bytes.length) return { bytes, marked: false };
    audio = bytes.subarray(10 + size);
  }
  // MPEG audio frame sync: 11 set bits.
  const isMpeg = audio.length > 2 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0;
  if (!isMpeg) return { bytes, marked: false };

  const note = `AI-generated audio (KI-generiert). Generator: ${generator}`;
  const frames = [
    ...id3Frame("TXXX", [0, ...ascii("AI_GENERATED"), 0, ...ascii("true")]),
    ...id3Frame("TXXX", [0, ...ascii("DIGITAL_SOURCE_TYPE"), 0, ...ascii("trainedAlgorithmicMedia")]),
    ...id3Frame("COMM", [0, ...ascii("eng"), 0, ...ascii(note)]),
  ];
  const header = [0x49, 0x44, 0x33, 0x03, 0x00, 0x00, ...syncsafe(frames.length)];
  const out = new Uint8Array(header.length + frames.length + audio.length);
  out.set(header, 0);
  out.set(frames, header.length);
  out.set(audio, header.length + frames.length);
  return { bytes: out, marked: true };
}
