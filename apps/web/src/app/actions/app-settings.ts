"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

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
    console.error("setAppSetting error:", error)
    return { success: false as const, error: "Fehler beim Speichern" }
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
