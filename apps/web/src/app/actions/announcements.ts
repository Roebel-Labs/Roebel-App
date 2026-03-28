"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export interface Announcement {
  id: string
  title: string
  description: string | null
  image_url: string | null
  cta_label: string
  cta_link: string | null
  cta_type: "deep_link" | "external_url"
  is_active: boolean
  priority: number
  show_once: boolean
  starts_at: string | null
  ends_at: string | null
  min_app_version: string | null
  max_app_version: string | null
  created_at: string
  updated_at: string
}

export async function createAnnouncement(formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const image_url = formData.get("image_url") as string
    const cta_label = formData.get("cta_label") as string
    const cta_link = formData.get("cta_link") as string
    const cta_type = formData.get("cta_type") as string
    const is_active = formData.get("is_active") === "true"
    const priority = formData.get("priority") as string
    const show_once = formData.get("show_once") === "true"
    const starts_at = formData.get("starts_at") as string
    const ends_at = formData.get("ends_at") as string
    const min_app_version = formData.get("min_app_version") as string
    const max_app_version = formData.get("max_app_version") as string

    const { data, error } = await supabase
      .from("announcements")
      .insert({
        title,
        description: description || null,
        image_url: image_url || null,
        cta_label: cta_label || "Mehr erfahren",
        cta_link: cta_link || null,
        cta_type: cta_type || "external_url",
        is_active,
        priority: priority ? parseInt(priority) : 0,
        show_once,
        starts_at: starts_at || null,
        ends_at: ends_at || null,
        min_app_version: min_app_version || null,
        max_app_version: max_app_version || null,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/announcements")

    return { success: true, data, message: "Ankündigung erfolgreich erstellt" }
  } catch (error) {
    console.error("Error creating announcement:", error)
    return { success: false, error: "Fehler beim Erstellen der Ankündigung" }
  }
}

export async function updateAnnouncement(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const image_url = formData.get("image_url") as string
    const cta_label = formData.get("cta_label") as string
    const cta_link = formData.get("cta_link") as string
    const cta_type = formData.get("cta_type") as string
    const is_active = formData.get("is_active") === "true"
    const priority = formData.get("priority") as string
    const show_once = formData.get("show_once") === "true"
    const starts_at = formData.get("starts_at") as string
    const ends_at = formData.get("ends_at") as string
    const min_app_version = formData.get("min_app_version") as string
    const max_app_version = formData.get("max_app_version") as string

    const { data, error } = await supabase
      .from("announcements")
      .update({
        title,
        description: description || null,
        image_url: image_url || null,
        cta_label: cta_label || "Mehr erfahren",
        cta_link: cta_link || null,
        cta_type: cta_type || "external_url",
        is_active,
        priority: priority ? parseInt(priority) : 0,
        show_once,
        starts_at: starts_at || null,
        ends_at: ends_at || null,
        min_app_version: min_app_version || null,
        max_app_version: max_app_version || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/announcements")

    return { success: true, data, message: "Ankündigung erfolgreich aktualisiert" }
  } catch (error) {
    console.error("Error updating announcement:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Ankündigung" }
  }
}

export async function deleteAnnouncement(id: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("announcements").delete().eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/announcements")

    return { success: true, message: "Ankündigung erfolgreich gelöscht" }
  } catch (error) {
    console.error("Error deleting announcement:", error)
    return { success: false, error: "Fehler beim Löschen der Ankündigung" }
  }
}

export async function toggleAnnouncementActive(id: string, isActive: boolean) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("announcements")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/announcements")

    return {
      success: true,
      message: isActive ? "Ankündigung aktiviert" : "Ankündigung deaktiviert",
    }
  } catch (error) {
    console.error("Error toggling announcement:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Ankündigung" }
  }
}
