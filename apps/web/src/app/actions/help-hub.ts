"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ── Types ──────────────────────────────────────────────

export interface HelpSection {
  id: string
  title: string
  view_mode: "grid" | "list"
  display_order: number
  is_published: boolean
  created_at: string
}

export interface HelpCollection {
  id: string
  section_id: string | null
  title: string
  subtitle: string | null
  icon_url: string | null
  cover_image_url: string | null
  display_order: number
  is_featured: boolean
  is_published: boolean
  created_at: string
  help_sections?: { title: string; view_mode: string } | null
}

export interface HelpItem {
  id: string
  collection_id: string
  title: string
  subtitle: string | null
  icon_url: string | null
  hero_media_url: string | null
  hero_media_type: string
  body_text: string | null
  steps: string[] | null
  action_enabled: boolean
  action_label: string | null
  action_route: string | null
  display_order: number
  is_published: boolean
  created_at: string
  help_collections?: { title: string } | null
}

export interface HelpVideo {
  id: string
  title: string
  thumbnail_url: string
  youtube_url: string
  duration: string
  published_date: string
  display_order: number
  is_published: boolean
  created_at: string
}

// ── Helpers ────────────────────────────────────────────

/**
 * Extracts a human-readable error message from any error shape
 * (Supabase PostgrestError, Error, string, unknown).
 */
function formatError(error: unknown): string {
  if (!error) return "Unbekannter Fehler"
  if (typeof error === "string") return error

  // Supabase PostgrestError: { message, details, hint, code }
  if (typeof error === "object") {
    const e = error as {
      message?: string
      details?: string
      hint?: string
      code?: string
    }
    const parts: string[] = []
    if (e.message) parts.push(e.message)
    if (e.details) parts.push(`Details: ${e.details}`)
    if (e.hint) parts.push(`Hinweis: ${e.hint}`)
    if (e.code) parts.push(`Code: ${e.code}`)
    if (parts.length > 0) return parts.join(" · ")
  }

  if (error instanceof Error) return error.message
  return String(error)
}

function logError(context: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(`[help-hub] ${context}`, {
    error,
    message: formatError(error),
    ...extra,
  })
}

// ── Sections ───────────────────────────────────────────

export async function createSection(formData: FormData) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("help_sections")
      .insert({
        title: formData.get("title") as string,
        view_mode: (formData.get("view_mode") as string) || "grid",
        display_order: parseInt(formData.get("display_order") as string) || 0,
        is_published: formData.get("is_published") === "true",
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Bereich erfolgreich erstellt" }
  } catch (error) {
    logError("createSection failed", error)
    return {
      success: false,
      error: `Fehler beim Erstellen des Bereichs: ${formatError(error)}`,
    }
  }
}

export async function updateSection(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("help_sections")
      .update({
        title: formData.get("title") as string,
        view_mode: (formData.get("view_mode") as string) || "grid",
        display_order: parseInt(formData.get("display_order") as string) || 0,
        is_published: formData.get("is_published") === "true",
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Bereich erfolgreich aktualisiert" }
  } catch (error) {
    logError("updateSection failed", error, { id })
    return {
      success: false,
      error: `Fehler beim Aktualisieren des Bereichs: ${formatError(error)}`,
    }
  }
}

export async function deleteSection(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from("help_sections").delete().eq("id", id)
    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, message: "Bereich erfolgreich gelöscht" }
  } catch (error) {
    logError("deleteSection failed", error, { id })
    return {
      success: false,
      error: `Fehler beim Löschen des Bereichs: ${formatError(error)}`,
    }
  }
}

export async function togglePublishSection(id: string, isPublished: boolean) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("help_sections")
      .update({ is_published: isPublished })
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return {
      success: true,
      message: isPublished ? "Bereich veröffentlicht" : "Bereich als Entwurf gespeichert",
    }
  } catch (error) {
    logError("togglePublishSection failed", error, { id, isPublished })
    return {
      success: false,
      error: `Fehler beim Ändern des Status: ${formatError(error)}`,
    }
  }
}

// ── Collections ────────────────────────────────────────

export async function createCollection(formData: FormData) {
  try {
    const supabase = await createClient()

    const sectionId = (formData.get("section_id") as string) || null

    const { data, error } = await supabase
      .from("help_collections")
      .insert({
        section_id: sectionId,
        title: formData.get("title") as string,
        subtitle: (formData.get("subtitle") as string) || null,
        icon_url: (formData.get("icon_url") as string) || null,
        cover_image_url: (formData.get("cover_image_url") as string) || null,
        display_order: parseInt(formData.get("display_order") as string) || 0,
        is_featured: formData.get("is_featured") === "true",
        is_published: formData.get("is_published") === "true",
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Sammlung erfolgreich erstellt" }
  } catch (error) {
    logError("createCollection failed", error)
    return {
      success: false,
      error: `Fehler beim Erstellen der Sammlung: ${formatError(error)}`,
    }
  }
}

export async function updateCollection(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const sectionId = (formData.get("section_id") as string) || null

    const { data, error } = await supabase
      .from("help_collections")
      .update({
        section_id: sectionId,
        title: formData.get("title") as string,
        subtitle: (formData.get("subtitle") as string) || null,
        icon_url: (formData.get("icon_url") as string) || null,
        cover_image_url: (formData.get("cover_image_url") as string) || null,
        display_order: parseInt(formData.get("display_order") as string) || 0,
        is_featured: formData.get("is_featured") === "true",
        is_published: formData.get("is_published") === "true",
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Sammlung erfolgreich aktualisiert" }
  } catch (error) {
    logError("updateCollection failed", error, { id })
    return {
      success: false,
      error: `Fehler beim Aktualisieren der Sammlung: ${formatError(error)}`,
    }
  }
}

export async function deleteCollection(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from("help_collections").delete().eq("id", id)
    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, message: "Sammlung erfolgreich gelöscht" }
  } catch (error) {
    logError("deleteCollection failed", error, { id })
    return {
      success: false,
      error: `Fehler beim Löschen der Sammlung: ${formatError(error)}`,
    }
  }
}

export async function togglePublishCollection(id: string, isPublished: boolean) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("help_collections")
      .update({ is_published: isPublished })
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return {
      success: true,
      message: isPublished ? "Sammlung veröffentlicht" : "Sammlung als Entwurf gespeichert",
    }
  } catch (error) {
    logError("togglePublishCollection failed", error, { id, isPublished })
    return {
      success: false,
      error: `Fehler beim Ändern des Status: ${formatError(error)}`,
    }
  }
}

// ── Items ──────────────────────────────────────────────

export async function createItem(formData: FormData) {
  try {
    const supabase = await createClient()

    const stepsRaw = formData.get("steps") as string
    const steps = stepsRaw ? JSON.parse(stepsRaw) : null

    const payload = {
      collection_id: formData.get("collection_id") as string,
      title: formData.get("title") as string,
      subtitle: (formData.get("subtitle") as string) || null,
      icon_url: (formData.get("icon_url") as string) || null,
      hero_media_url: (formData.get("hero_media_url") as string) || null,
      hero_media_type: (formData.get("hero_media_type") as string) || "image",
      body_text: (formData.get("body_text") as string) || null,
      steps,
      action_enabled: formData.get("action_enabled") === "true",
      action_label: (formData.get("action_label") as string) || null,
      action_route: (formData.get("action_route") as string) || null,
      display_order: parseInt(formData.get("display_order") as string) || 0,
      is_published: formData.get("is_published") === "true",
    }

    console.log("[help-hub] createItem payload", payload)

    const { data, error } = await supabase
      .from("help_items")
      .insert(payload)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Hilfe-Artikel erfolgreich erstellt" }
  } catch (error) {
    logError("createItem failed", error)
    return {
      success: false,
      error: `Fehler beim Erstellen des Hilfe-Artikels: ${formatError(error)}`,
    }
  }
}

export async function updateItem(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const stepsRaw = formData.get("steps") as string
    const steps = stepsRaw ? JSON.parse(stepsRaw) : null

    const payload = {
      collection_id: formData.get("collection_id") as string,
      title: formData.get("title") as string,
      subtitle: (formData.get("subtitle") as string) || null,
      icon_url: (formData.get("icon_url") as string) || null,
      hero_media_url: (formData.get("hero_media_url") as string) || null,
      hero_media_type: (formData.get("hero_media_type") as string) || "image",
      body_text: (formData.get("body_text") as string) || null,
      steps,
      action_enabled: formData.get("action_enabled") === "true",
      action_label: (formData.get("action_label") as string) || null,
      action_route: (formData.get("action_route") as string) || null,
      display_order: parseInt(formData.get("display_order") as string) || 0,
      is_published: formData.get("is_published") === "true",
    }

    console.log("[help-hub] updateItem payload", { id, payload })

    const { data, error } = await supabase
      .from("help_items")
      .update(payload)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Hilfe-Artikel erfolgreich aktualisiert" }
  } catch (error) {
    logError("updateItem failed", error, { id })
    return {
      success: false,
      error: `Fehler beim Aktualisieren des Hilfe-Artikels: ${formatError(error)}`,
    }
  }
}

export async function deleteItem(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from("help_items").delete().eq("id", id)
    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, message: "Hilfe-Artikel erfolgreich gelöscht" }
  } catch (error) {
    logError("deleteItem failed", error, { id })
    return {
      success: false,
      error: `Fehler beim Löschen des Hilfe-Artikels: ${formatError(error)}`,
    }
  }
}

export async function togglePublishItem(id: string, isPublished: boolean) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("help_items")
      .update({ is_published: isPublished })
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return {
      success: true,
      message: isPublished ? "Artikel veröffentlicht" : "Artikel als Entwurf gespeichert",
    }
  } catch (error) {
    logError("togglePublishItem failed", error, { id, isPublished })
    return {
      success: false,
      error: `Fehler beim Ändern des Status: ${formatError(error)}`,
    }
  }
}

// ── Videos ─────────────────────────────────────────────

export async function createVideo(formData: FormData) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("help_videos")
      .insert({
        title: formData.get("title") as string,
        thumbnail_url: formData.get("thumbnail_url") as string,
        youtube_url: formData.get("youtube_url") as string,
        duration: formData.get("duration") as string,
        published_date: formData.get("published_date") as string,
        display_order: parseInt(formData.get("display_order") as string) || 0,
        is_published: formData.get("is_published") === "true",
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Video erfolgreich erstellt" }
  } catch (error) {
    logError("createVideo failed", error)
    return {
      success: false,
      error: `Fehler beim Erstellen des Videos: ${formatError(error)}`,
    }
  }
}

export async function updateVideo(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("help_videos")
      .update({
        title: formData.get("title") as string,
        thumbnail_url: formData.get("thumbnail_url") as string,
        youtube_url: formData.get("youtube_url") as string,
        duration: formData.get("duration") as string,
        published_date: formData.get("published_date") as string,
        display_order: parseInt(formData.get("display_order") as string) || 0,
        is_published: formData.get("is_published") === "true",
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Video erfolgreich aktualisiert" }
  } catch (error) {
    logError("updateVideo failed", error, { id })
    return {
      success: false,
      error: `Fehler beim Aktualisieren des Videos: ${formatError(error)}`,
    }
  }
}

export async function deleteVideo(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from("help_videos").delete().eq("id", id)
    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, message: "Video erfolgreich gelöscht" }
  } catch (error) {
    logError("deleteVideo failed", error, { id })
    return {
      success: false,
      error: `Fehler beim Löschen des Videos: ${formatError(error)}`,
    }
  }
}

export async function togglePublishVideo(id: string, isPublished: boolean) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("help_videos")
      .update({ is_published: isPublished })
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return {
      success: true,
      message: isPublished ? "Video veröffentlicht" : "Video als Entwurf gespeichert",
    }
  } catch (error) {
    logError("togglePublishVideo failed", error, { id, isPublished })
    return {
      success: false,
      error: `Fehler beim Ändern des Status: ${formatError(error)}`,
    }
  }
}
