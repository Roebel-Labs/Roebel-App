"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { EventExperience, CreateExperienceInput } from "@/types/event-experience"

// ============================================
// Read operations
// ============================================

export async function getExperiences(
  eventId: string,
  limit = 15,
  offset = 0
): Promise<{ success: boolean; data?: EventExperience[]; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: experiences, error } = await supabase
      .from("event_experiences")
      .select("*")
      .eq("event_id", eventId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error
    if (!experiences || experiences.length === 0) {
      return { success: true, data: [] }
    }

    // Batch fetch author info
    const addresses = [...new Set(experiences.map((e: Record<string, unknown>) => e.wallet_address as string))]
    const authorMap = new Map<string, Record<string, unknown>>()

    if (addresses.length > 0) {
      const { data: authors } = await supabase
        .from("users")
        .select("wallet_address, username, profile_picture_url")
        .in("wallet_address", addresses)

      for (const a of authors || []) {
        authorMap.set(a.wallet_address as string, a as Record<string, unknown>)
      }
    }

    const result: EventExperience[] = experiences.map((row: Record<string, unknown>) => {
      const author = authorMap.get(row.wallet_address as string)
      return {
        id: row.id as string,
        event_id: row.event_id as string,
        wallet_address: row.wallet_address as string,
        content: row.content as string,
        media_urls: (row.media_urls as string[]) || [],
        video_url: (row.video_url as string) || null,
        emoji: (row.emoji as string) || null,
        status: row.status as EventExperience["status"],
        created_at: row.created_at as string,
        author_username: (author?.username as string) || null,
        author_profile_picture_url: (author?.profile_picture_url as string) || null,
      }
    })

    return { success: true, data: result }
  } catch (error) {
    console.error("Error fetching experiences:", error)
    return { success: false, error: "Fehler beim Laden der Erlebnisse" }
  }
}

export async function getExperienceCount(
  eventId: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const supabase = await createClient()

    const { count, error } = await supabase
      .from("event_experiences")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "published")

    if (error) throw error

    return { success: true, count: count || 0 }
  } catch (error) {
    console.error("Error counting experiences:", error)
    return { success: false, error: "Fehler beim Zählen der Erlebnisse" }
  }
}

// ============================================
// Write operations
// ============================================

export async function createExperience(
  input: CreateExperienceInput
): Promise<{ success: boolean; data?: EventExperience; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: experience, error } = await supabase
      .from("event_experiences")
      .insert({
        event_id: input.event_id,
        wallet_address: input.wallet_address.toLowerCase(),
        content: input.content,
        media_urls: input.media_urls || [],
        video_url: input.video_url || null,
        emoji: input.emoji || null,
      })
      .select()
      .single()

    if (error) throw error

    // Mirror to posts so the experience surfaces in the main feed.
    // Best-effort: log errors but still return the experience.
    const { error: postError } = await supabase.from("posts").insert({
      wallet_address: experience.wallet_address,
      content: experience.content,
      media_urls: experience.media_urls ?? [],
      video_url: experience.video_url ?? null,
      category: "generell",
      feed_type: "main",
      post_type: "event_experience",
      linked_event_id: experience.event_id,
      linked_experience_id: experience.id,
      status: "published",
    })
    if (postError) {
      console.error("Error mirroring experience to feed:", postError)
    }

    // Fetch author info
    const { data: author } = await supabase
      .from("users")
      .select("username, profile_picture_url")
      .eq("wallet_address", input.wallet_address.toLowerCase())
      .single()

    revalidatePath(`/events/${input.event_id}`)
    revalidatePath(`/app/events/${input.event_id}`)
    revalidatePath("/app")

    return {
      success: true,
      data: {
        id: experience.id,
        event_id: experience.event_id,
        wallet_address: experience.wallet_address,
        content: experience.content,
        media_urls: experience.media_urls || [],
        video_url: experience.video_url || null,
        emoji: experience.emoji || null,
        status: experience.status,
        created_at: experience.created_at,
        author_username: (author?.username as string) || null,
        author_profile_picture_url: (author?.profile_picture_url as string) || null,
      },
    }
  } catch (error) {
    console.error("Error creating experience:", error)
    return { success: false, error: "Fehler beim Erstellen des Erlebnisses" }
  }
}

export async function deleteExperience(
  experienceId: string,
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("event_experiences")
      .update({ status: "deleted" })
      .eq("id", experienceId)
      .eq("wallet_address", walletAddress.toLowerCase())

    if (error) throw error

    // Cascade soft-delete to the mirrored feed post.
    const { error: postError } = await supabase
      .from("posts")
      .update({ status: "deleted" })
      .eq("linked_experience_id", experienceId)
    if (postError) {
      console.error("Error soft-deleting paired feed post:", postError)
    }

    revalidatePath("/events")
    revalidatePath("/app/events")
    revalidatePath("/app")

    return { success: true }
  } catch (error) {
    console.error("Error deleting experience:", error)
    return { success: false, error: "Fehler beim Löschen des Erlebnisses" }
  }
}
