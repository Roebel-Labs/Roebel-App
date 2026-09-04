"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { isAuthenticated } from "@/lib/auth/session"
import { clampSpeed, DEFAULT_SPEED } from "@/lib/event-radio/tts"

const EVENT_STORIES_AUDIO_KEY = "event_stories_audio_url"

/**
 * Read a single global setting value. Returns null if unset / missing.
 */
async function getAppSetting(key: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle()

  if (error) {
    console.error("getAppSetting error:", error)
    return null
  }
  return data?.value ?? null
}

/**
 * Upsert a single global setting value. Auth is enforced by the
 * route-protected admin dashboard (same MVP model as manage-events).
 */
async function setAppSetting(key: string, value: string | null) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key, value: value || null, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      )

    if (error) throw error
    return { success: true as const }
  } catch (error) {
    // Surface the real Postgres/Supabase message to the client toast so
    // failures (e.g. missing app_settings table / RLS) are diagnosable —
    // the server-side console.error never reaches the browser console.
    console.error("setAppSetting error:", error)
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Fehler beim Speichern"
    return { success: false as const, error: message }
  }
}

/** Shared background audio track that plays under all event stories. */
export async function getEventStoriesAudioUrl(): Promise<string | null> {
  return getAppSetting(EVENT_STORIES_AUDIO_KEY)
}

export async function setEventStoriesAudioUrl(url: string | null) {
  const result = await setAppSetting(EVENT_STORIES_AUDIO_KEY, url)
  if (result.success) {
    revalidatePath("/admin/dashboard/events")
  }
  return result
}

const EVENT_RADIO_VOICE_KEY = "event_radio_voice_id"
const EVENT_RADIO_ENABLED_KEY = "event_radio_enabled"
const EVENT_RADIO_SPEED_KEY = "event_radio_speed"

/** Wochen-Radio: ElevenLabs voice id + app kill switch (missing = enabled). */
export async function getEventRadioSettings(): Promise<{
  voiceId: string | null
  enabled: boolean
  speed: number
}> {
  const [voiceId, enabled, speed] = await Promise.all([
    getAppSetting(EVENT_RADIO_VOICE_KEY),
    getAppSetting(EVENT_RADIO_ENABLED_KEY),
    getAppSetting(EVENT_RADIO_SPEED_KEY),
  ])
  return {
    voiceId: voiceId?.trim() || null,
    enabled: enabled !== "false",
    speed: clampSpeed(speed ?? DEFAULT_SPEED),
  }
}

/** Sprechtempo, 0.7 bis 1.2. Änderungen lassen alle Beiträge neu erzeugen. */
export async function setEventRadioSpeed(speed: number) {
  if (!(await isAuthenticated())) return { success: false as const, error: "Nicht autorisiert" }
  const result = await setAppSetting(EVENT_RADIO_SPEED_KEY, String(clampSpeed(speed)))
  if (result.success) revalidatePath("/admin/dashboard/events")
  return result
}

export async function setEventRadioVoiceId(voiceId: string | null) {
  if (!(await isAuthenticated())) return { success: false as const, error: "Nicht autorisiert" }
  const result = await setAppSetting(EVENT_RADIO_VOICE_KEY, voiceId?.trim() || null)
  if (result.success) revalidatePath("/admin/dashboard/events")
  return result
}

export async function setEventRadioEnabled(enabled: boolean) {
  if (!(await isAuthenticated())) return { success: false as const, error: "Nicht autorisiert" }
  const result = await setAppSetting(EVENT_RADIO_ENABLED_KEY, enabled ? "true" : "false")
  if (result.success) revalidatePath("/admin/dashboard/events")
  return result
}
