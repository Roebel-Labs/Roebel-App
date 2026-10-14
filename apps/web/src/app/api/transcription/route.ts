// POST /api/transcription — admin-only. Body: { path, language, format, prompt? }.
// The audio was uploaded beforehand to the private `admin-transcriptions` bucket
// (signed URL, see app/actions/transcription.ts). This route downloads it,
// sends it to OpenAI's transcription API and deletes it again.
import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const BUCKET = "admin-transcriptions"
// Plain text uses the most accurate model; timestamps (SRT) are only offered
// by whisper-1.
const TEXT_MODEL = "gpt-4o-transcribe"
const SRT_MODEL = "whisper-1"

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  flac: "audio/flac",
}

type Body = {
  path?: string
  language?: string
  format?: "text" | "srt"
  prompt?: string
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 })
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY ist nicht gesetzt." }, { status: 503 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 })
  }
  const path = body.path ?? ""
  if (!path.startsWith("uploads/") || path.includes("..")) {
    return NextResponse.json({ error: "Ungültiger Dateipfad" }, { status: 400 })
  }
  const format = body.format === "srt" ? "srt" : "text"
  const language = body.language && /^[a-z]{2}$/.test(body.language) ? body.language : undefined

  const supabase = createAdminClient()
  try {
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !blob) {
      return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 })
    }

    const ext = path.split(".").pop()?.toLowerCase() ?? ""
    const mime = MIME_BY_EXT[ext]
    if (!mime) {
      return NextResponse.json({ error: "Dateiformat wird nicht unterstützt" }, { status: 415 })
    }

    const upstream = new FormData()
    upstream.append("model", format === "srt" ? SRT_MODEL : TEXT_MODEL)
    upstream.append("response_format", format === "srt" ? "srt" : "json")
    if (language) upstream.append("language", language)
    if (body.prompt?.trim()) upstream.append("prompt", body.prompt.trim().slice(0, 1000))
    upstream.append("file", new File([await blob.arrayBuffer()], `audio.${ext}`, { type: mime }))

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: upstream,
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      console.error(`[transcription] OpenAI ${res.status}: ${detail}`)
      return NextResponse.json({ error: `OpenAI-Fehler (${res.status})`, detail }, { status: 502 })
    }

    const text =
      format === "srt" ? (await res.text()).trim() : (((await res.json()) as { text?: string }).text ?? "").trim()
    return NextResponse.json({ text, format, model: format === "srt" ? SRT_MODEL : TEXT_MODEL })
  } catch (err) {
    console.error("[transcription] failed:", err)
    return NextResponse.json({ error: "Transkription fehlgeschlagen" }, { status: 500 })
  } finally {
    // Never keep the audio around after the request.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
  }
}
