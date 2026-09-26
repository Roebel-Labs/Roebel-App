import { NextResponse } from "next/server";
import { STT_MODEL } from "@/lib/chat/models";
import { badRequest, handleError, jsonError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

/** POST /api/chat/transcribe — multipart `audio` (m4a) → { text }. Route `stt`. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  if (!process.env.OPENAI_API_KEY) return jsonError(503, "stt_unavailable", "Spracherkennung ist gerade nicht verfügbar.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Ungültige Aufnahme.");
  }
  const audio = form.get("audio");
  if (!audio || typeof audio === "string") return badRequest("Keine Aufnahme gefunden.");
  if (audio.size === 0) return badRequest("Die Aufnahme ist leer.");
  if (audio.size > MAX_BYTES) return jsonError(413, "too_large", "Die Aufnahme ist zu lang.");
  try {
    // Call OpenAI directly with the recording's own file name: the AI SDK
    // re-labels the bytes ("audio.mp4") and OpenAI rejects iOS/Android AAC
    // recordings with `unsupported_format`.
    const name = audioFileName(audio);
    const upstream = new FormData();
    upstream.append("model", STT_MODEL);
    upstream.append("language", "de");
    upstream.append("file", new File([await audio.arrayBuffer()], name, { type: audioMimeType(name) }));
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: upstream,
    });
    if (!res.ok) throw new Error(`OpenAI transcription ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: (data.text ?? "").trim() });
  } catch (err) {
    return handleError(err, "transcribe");
  }
}

const AUDIO_EXTENSIONS = ["m4a", "mp4", "mp3", "wav", "webm", "ogg", "flac", "aac"] as const;

/** Keeps the client's extension when OpenAI understands it; recordings default to m4a. */
function audioFileName(file: File): string {
  const ext = file.name?.split(".").pop()?.toLowerCase();
  return ext && (AUDIO_EXTENSIONS as readonly string[]).includes(ext) ? `aufnahme.${ext}` : "aufnahme.m4a";
}

function audioMimeType(name: string): string {
  const ext = name.split(".").pop();
  if (ext === "m4a" || ext === "mp4" || ext === "aac") return "audio/mp4";
  if (ext === "mp3") return "audio/mpeg";
  return `audio/${ext}`;
}
