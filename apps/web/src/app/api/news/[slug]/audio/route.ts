// apps/web/src/app/api/news/[slug]/audio/route.ts
// "Vorlesen" for news articles. Returns a cached MP3 of the published article
// read by the Wochen-Radio voice (Mecky), rendering it through ElevenLabs on
// the first request. Files are content addressed, so an edited article gets a
// fresh recording and the stale one is removed. POST (not GET) so link
// previews and crawlers never trigger a paid render.
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readSetting } from "@/lib/event-radio/gather"
import { SETTING_SPEED, SETTING_VOICE_ID } from "@/lib/event-radio/generate"
import { RADIO_BUCKET } from "@/lib/event-radio/storage"
import { clampSpeed, DEFAULT_SPEED, synthesizeSpeech } from "@/lib/event-radio/tts"
import {
  buildNarrationText,
  chunkText,
  durationFromFileName,
  narrationFileName,
  narrationHash,
  narrationObjectStem,
} from "@/lib/news-audio/narration"

export const runtime = "nodejs"
export const maxDuration = 300

type ArticleRow = { id: string; title: string; excerpt: string | null; content: string | null }

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: "Vorlesen ist gerade nicht verfügbar" }, { status: 503 })

  const supabase = createAdminClient()
  const voiceId = await readSetting(supabase, SETTING_VOICE_ID)
  if (!voiceId) return NextResponse.json({ error: "Vorlesen ist gerade nicht verfügbar" }, { status: 503 })
  const speed = clampSpeed((await readSetting(supabase, SETTING_SPEED)) ?? DEFAULT_SPEED)

  const { data, error } = await supabase
    .from("news_articles")
    .select("id, title, excerpt, content")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()
  if (error) {
    console.error("[NewsAudio] article lookup:", error.message)
    return NextResponse.json({ error: "Artikel konnte nicht geladen werden" }, { status: 500 })
  }
  const article = data as ArticleRow | null
  if (!article) return NextResponse.json({ error: "Artikel nicht gefunden" }, { status: 404 })

  const text = buildNarrationText(article)
  const { folder, stem } = narrationObjectStem(article.id, narrationHash(text, { voiceId, speed }))
  const bucket = supabase.storage.from(RADIO_BUCKET)

  const { data: files } = await bucket.list(folder, { limit: 100 })
  const cached = (files ?? []).find((f) => durationFromFileName(stem, f.name) !== null)
  if (cached) {
    const path = `${folder}/${cached.name}`
    return NextResponse.json({
      url: bucket.getPublicUrl(path).data.publicUrl,
      durationMs: durationFromFileName(stem, cached.name),
    })
  }

  try {
    const chunks = chunkText(text)
    const parts: Buffer[] = []
    let durationMs = 0
    for (let i = 0; i < chunks.length; i++) {
      const res = await synthesizeSpeech({
        text: chunks[i],
        voiceId,
        apiKey,
        speed,
        previousText: i > 0 ? chunks[i - 1].slice(-1000) : undefined,
      })
      parts.push(res.audio)
      durationMs += res.durationMs
    }

    const path = `${folder}/${narrationFileName(stem, durationMs)}`
    const { error: uploadError } = await bucket.upload(path, Buffer.concat(parts), {
      contentType: "audio/mpeg",
      cacheControl: "31536000",
      upsert: true,
    })
    if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)

    // Older recordings of this article (before an edit) are no longer reachable.
    const stale = (files ?? []).map((f) => `${folder}/${f.name}`).filter((p) => p !== path)
    if (stale.length > 0) {
      const { error: removeError } = await bucket.remove(stale)
      if (removeError) console.error("[NewsAudio] remove stale:", removeError.message)
    }

    return NextResponse.json({ url: bucket.getPublicUrl(path).data.publicUrl, durationMs })
  } catch (err) {
    console.error("[NewsAudio] render failed:", err)
    return NextResponse.json({ error: "Vorlesen fehlgeschlagen" }, { status: 502 })
  }
}
