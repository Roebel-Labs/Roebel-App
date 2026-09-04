// apps/web/src/app/actions/event-radio.ts
"use server"

import { isAuthenticated } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { gatherWeekEvents, loadExistingRows } from "@/lib/event-radio/gather"
import { planScopes } from "@/lib/event-radio/plan"
import { pickLatestPerScope, scopeId } from "@/lib/event-radio/select"
import { TTS_MODEL_ID } from "@/lib/event-radio/tts"
import { berlinToday, weekWindow } from "@/lib/event-radio/window"
import { listOwnVoices, type RadioVoice } from "@/lib/event-radio/voices"
import { getEventRadioSettings } from "./app-settings"

export type { RadioVoice }

export type SegmentView = { audioUrl: string; script: string; durationMs: number; createdAt: string }

export type EventRadioOverview = {
  enabled: boolean
  voiceId: string | null
  speed: number
  window: { start: string; end: string; weekKey: string }
  lastGeneratedAt: string | null
  intro: SegmentView | null
  outro: SegmentView | null
  events: Array<{
    id: string
    title: string
    date: string
    segment: SegmentView | null
    status: "current" | "stale" | "missing"
  }>
}

export async function getEventRadioOverview(): Promise<EventRadioOverview> {
  if (!(await isAuthenticated())) throw new Error("Nicht autorisiert")
  const supabase = createAdminClient()
  const settings = await getEventRadioSettings()
  const todayKey = berlinToday()
  const window = weekWindow(todayKey)
  const [events, existing] = await Promise.all([gatherWeekEvents(supabase, window), loadExistingRows(supabase)])
  const latest = pickLatestPerScope(existing)
  const view = (
    row: { audio_url: string; script: string; duration_ms: number; created_at: string } | undefined,
  ): SegmentView | null =>
    row ? { audioUrl: row.audio_url, script: row.script, durationMs: row.duration_ms, createdAt: row.created_at } : null

  const ctx = { voiceId: settings.voiceId ?? "", modelId: TTS_MODEL_ID, speed: settings.speed }
  const plan = planScopes({ events, todayKey, weekKey: window.weekKey, existing, ctx, force: false })

  const lastGeneratedAt = existing.reduce<string | null>(
    (max, r) => (!max || Date.parse(r.created_at) > Date.parse(max) ? r.created_at : max),
    null,
  )

  return {
    enabled: settings.enabled,
    voiceId: settings.voiceId,
    speed: settings.speed,
    window,
    lastGeneratedAt,
    intro: view(latest.get(scopeId("intro", todayKey))),
    outro: view(latest.get(scopeId("outro", window.weekKey))),
    events: plan.events.map((p) => {
      const row = latest.get(scopeId("event", p.scopeKey))
      return {
        id: p.scopeKey,
        title: p.event?.title ?? "",
        date: p.event?.date ?? "",
        segment: view(row),
        status: !row ? "missing" : p.needed ? "stale" : "current",
      }
    }),
  }
}

export type VoiceListResult = { voices: RadioVoice[]; error: string | null }

/**
 * The account's own ElevenLabs voices, offered as host candidates in the
 * panel. Never throws: an unreachable list comes back as an `error` string so
 * the panel can say WHY the picker is empty instead of hiding silently.
 */
export async function getEventRadioVoices(): Promise<VoiceListResult> {
  if (!(await isAuthenticated())) throw new Error("Nicht autorisiert")
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return {
      voices: [],
      error:
        "ELEVENLABS_API_KEY fehlt auf diesem Server. Lokal: Dev-Server nach dem Eintragen in .env.local neu starten. Produktion: Variable in Vercel setzen und neu deployen.",
    }
  }
  try {
    return { voices: await listOwnVoices(apiKey), error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[EventRadio] Stimmen laden fehlgeschlagen:", message)
    return { voices: [], error: `Stimmen konnten nicht geladen werden: ${message}` }
  }
}
