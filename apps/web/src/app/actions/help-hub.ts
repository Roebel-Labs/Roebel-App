"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ── Types ──────────────────────────────────────────────

export interface HelpCollection {
  id: string
  title: string
  subtitle: string | null
  icon_url: string | null
  cover_image_url: string | null
  display_order: number
  is_featured: boolean
  is_published: boolean
  created_at: string
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

// ── Collections ────────────────────────────────────────

export async function createCollection(formData: FormData) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("help_collections")
      .insert({
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
    console.error("Error creating collection:", error)
    return { success: false, error: "Fehler beim Erstellen der Sammlung" }
  }
}

export async function updateCollection(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("help_collections")
      .update({
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
    console.error("Error updating collection:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Sammlung" }
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
    console.error("Error deleting collection:", error)
    return { success: false, error: "Fehler beim Löschen der Sammlung" }
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
    console.error("Error toggling collection publish:", error)
    return { success: false, error: "Fehler beim Ändern des Status" }
  }
}

// ── Items ──────────────────────────────────────────────

export async function createItem(formData: FormData) {
  try {
    const supabase = await createClient()

    const stepsRaw = formData.get("steps") as string
    const steps = stepsRaw ? JSON.parse(stepsRaw) : null

    const { data, error } = await supabase
      .from("help_items")
      .insert({
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
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Hilfe-Artikel erfolgreich erstellt" }
  } catch (error) {
    console.error("Error creating item:", error)
    return { success: false, error: "Fehler beim Erstellen des Hilfe-Artikels" }
  }
}

export async function updateItem(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const stepsRaw = formData.get("steps") as string
    const steps = stepsRaw ? JSON.parse(stepsRaw) : null

    const { data, error } = await supabase
      .from("help_items")
      .update({
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
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/help")
    return { success: true, data, message: "Hilfe-Artikel erfolgreich aktualisiert" }
  } catch (error) {
    console.error("Error updating item:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Hilfe-Artikels" }
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
    console.error("Error deleting item:", error)
    return { success: false, error: "Fehler beim Löschen des Hilfe-Artikels" }
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
    console.error("Error toggling item publish:", error)
    return { success: false, error: "Fehler beim Ändern des Status" }
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
    console.error("Error creating video:", error)
    return { success: false, error: "Fehler beim Erstellen des Videos" }
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
    console.error("Error updating video:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Videos" }
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
    console.error("Error deleting video:", error)
    return { success: false, error: "Fehler beim Löschen des Videos" }
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
    console.error("Error toggling video publish:", error)
    return { success: false, error: "Fehler beim Ändern des Status" }
  }
}
