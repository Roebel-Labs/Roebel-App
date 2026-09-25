import { NextResponse } from "next/server";
import { experimental_transcribe as transcribe } from "ai";
import { openai } from "@ai-sdk/openai";
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
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const result = await transcribe({
      model: openai.transcription(STT_MODEL),
      audio: bytes,
      providerOptions: { openai: { language: "de" } },
    });
    return NextResponse.json({ text: result.text.trim() });
  } catch (err) {
    return handleError(err, "transcribe");
  }
}
