"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAuthenticated } from "@/lib/auth/session"
import type { TranscriptSegment } from "@/lib/audio-transcript"

const BUCKET = "audio-content"
const ADMIN_PATH = "/admin/dashboard/hoeren"

export type AudioKind = "short_story" | "audiobook" | "podcast"
export type AudioStatus = "draft" | "published" | "archived"

export interface AudioShow {
  id: string
  slug: string | null
  kind: AudioKind
  title: string
  author: string | null
  description: string | null
  cover_url: string | null
  accent_color: string | null
  language: string
  status: AudioStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export interface AudioEpisode {
  id: string
  show_id: string
  episode_number: number | null
  title: string
  description: string | null
  cover_url: string | null
  audio_url: string | null
  duration_seconds: number | null
  transcript: TranscriptSegment[]
  transcript_source: string | null
  status: AudioStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

export type AudioShowWithCount = AudioShow & { episode_count: number }

type Result<T> = { success: true; data: T } | { success: false; error: string }

async function guard(): Promise<string | null> {
  return (await isAuthenticated()) ? null : "Nicht angemeldet"
}

function message(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message)
  return String(error)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "file"
}

/**
 * Signed upload URL into the public `audio-content` bucket. The browser
 * uploads directly to Storage, bypassing Vercel's ~4.5 MB body limit — an
 * audio file of a short story is easily 20–60 MB.
 */
export async function createAudioUploadTarget(
  fileName: string,
  folder: "covers" | "audio",
): Promise<Result<{ path: string; token: string; publicUrl: string }>> {
  const denied = await guard()
  if (denied) return { success: false, error: denied }
  try {
    const supabase = createAdminClient()
    const path = `${folder}/${randomUUID()}-${safeName(fileName)}`
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error) throw error
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return { success: true, data: { path, token: data.token, publicUrl: pub.publicUrl } }
  } catch (error) {
    console.error("[audio-content] upload target failed:", error)
    return { success: false, error: `Upload konnte nicht vorbereitet werden: ${message(error)}` }
  }
}

export async function listAudioShows(): Promise<Result<AudioShowWithCount[]>> {
  const denied = await guard()
  if (denied) return { success: false, error: denied }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("audio_shows")
    .select("*, audio_episodes(count)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
  if (error) return { success: false, error: message(error) }
  const rows = (data ?? []) as (AudioShow & { audio_episodes: { count: number }[] })[]
  return {
    success: true,
    data: rows.map(({ audio_episodes, ...show }) => ({ ...show, episode_count: audio_episodes?.[0]?.count ?? 0 })),
  }
}

export async function getAudioShow(id: string): Promise<Result<{ show: AudioShow; episodes: AudioEpisode[] }>> {
  const denied = await guard()
  if (denied) return { success: false, error: denied }
  const supabase = createAdminClient()
  const [{ data: show, error }, { data: episodes, error: epError }] = await Promise.all([
    supabase.from("audio_shows").select("*").eq("id", id).single(),
    supabase
      .from("audio_episodes")
      .select("*")
      .eq("show_id", id)
      .order("episode_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ])
  if (error) return { success: false, error: message(error) }
  if (epError) return { success: false, error: message(epError) }
  return { success: true, data: { show: show as AudioShow, episodes: (episodes ?? []) as AudioEpisode[] } }
}

export type AudioShowInput = {
  kind: AudioKind
  title: string
  author: string
  description: string
  cover_url: string
  accent_color: string
  language: string
  status: AudioStatus
  sort_order: number
}

export async function saveAudioShow(id: string | null, input: AudioShowInput): Promise<Result<{ id: string }>> {
  const denied = await guard()
  if (denied) return { success: false, error: denied }
  if (!input.title.trim()) return { success: false, error: "Titel fehlt" }

  const row = {
    kind: input.kind,
    title: input.title.trim(),
    author: input.author.trim() || null,
    description: input.description.trim() || null,
    cover_url: input.cover_url || null,
    accent_color: /^#[0-9a-fA-F]{6}$/.test(input.accent_color) ? input.accent_color : null,
    language: input.language || "de",
    status: input.status,
    sort_order: Number.isFinite(input.sort_order) ? input.sort_order : 0,
  }

  const supabase = createAdminClient()
  const query = id
    ? supabase.from("audio_shows").update(row).eq("id", id).select("id").single()
    : supabase
        .from("audio_shows")
        .insert({ ...row, slug: `${slugify(row.title)}-${randomUUID().slice(0, 6)}` })
        .select("id")
        .single()
  const { data, error } = await query
  if (error) return { success: false, error: message(error) }
  revalidatePath(ADMIN_PATH)
  return { success: true, data: { id: (data as { id: string }).id } }
}

export async function deleteAudioShow(id: string): Promise<Result<null>> {
  const denied = await guard()
  if (denied) return { success: false, error: denied }
  const { error } = await createAdminClient().from("audio_shows").delete().eq("id", id)
  if (error) return { success: false, error: message(error) }
  revalidatePath(ADMIN_PATH)
  return { success: true, data: null }
}

export async function getAudioEpisode(id: string): Promise<Result<AudioEpisode>> {
  const denied = await guard()
  if (denied) return { success: false, error: denied }
  const { data, error } = await createAdminClient().from("audio_episodes").select("*").eq("id", id).single()
  if (error) return { success: false, error: message(error) }
  return { success: true, data: data as AudioEpisode }
}

export type AudioEpisodeInput = {
  show_id: string
  episode_number: number | null
  title: string
  description: string
  cover_url: string
  audio_url: string
  duration_seconds: number | null
  transcript: TranscriptSegment[]
  transcript_source: string | null
  status: AudioStatus
}

function cleanTranscript(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments
    .filter((s) => s && typeof s.text === "string" && s.text.trim() && Number.isFinite(s.start))
    .map((s) => ({
      start: Math.max(0, Math.round(s.start * 100) / 100),
      end: Math.max(0, Math.round((Number.isFinite(s.end) ? s.end : s.start) * 100) / 100),
      text: s.text.trim(),
    }))
    .sort((a, b) => a.start - b.start)
}

export async function saveAudioEpisode(
  id: string | null,
  input: AudioEpisodeInput,
): Promise<Result<{ id: string }>> {
  const denied = await guard()
  if (denied) return { success: false, error: denied }
  if (!input.title.trim()) return { success: false, error: "Titel fehlt" }
  if (input.status === "published" && !input.audio_url) {
    return { success: false, error: "Zum Veröffentlichen fehlt die Audiodatei" }
  }

  const supabase = createAdminClient()
  let publishedAt: string | null = null
  if (input.status === "published") {
    if (id) {
      const { data: existing } = await supabase.from("audio_episodes").select("published_at").eq("id", id).single()
      publishedAt = (existing as { published_at: string | null } | null)?.published_at ?? new Date().toISOString()
    } else {
      publishedAt = new Date().toISOString()
    }
  }

  const row = {
    show_id: input.show_id,
    episode_number: input.episode_number,
    title: input.title.trim(),
    description: input.description.trim() || null,
    cover_url: input.cover_url || null,
    audio_url: input.audio_url || null,
    duration_seconds: input.duration_seconds,
    transcript: cleanTranscript(input.transcript),
    transcript_source: input.transcript_source,
    status: input.status,
    published_at: publishedAt,
  }

  const query = id
    ? supabase.from("audio_episodes").update(row).eq("id", id).select("id").single()
    : supabase.from("audio_episodes").insert(row).select("id").single()
  const { data, error } = await query
  if (error) return { success: false, error: message(error) }
  revalidatePath(`${ADMIN_PATH}/${input.show_id}`)
  return { success: true, data: { id: (data as { id: string }).id } }
}

export async function deleteAudioEpisode(id: string, showId: string): Promise<Result<null>> {
  const denied = await guard()
  if (denied) return { success: false, error: denied }
  const { error } = await createAdminClient().from("audio_episodes").delete().eq("id", id)
  if (error) return { success: false, error: message(error) }
  revalidatePath(`${ADMIN_PATH}/${showId}`)
  return { success: true, data: null }
}
