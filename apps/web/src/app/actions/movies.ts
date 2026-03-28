"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export interface Movie {
  id: string
  title: string
  description: string | null
  date: string
  time: string | null
  cover_image_url: string | null
  trailer_youtube_url: string | null
  fsk: string | null
  status: "draft" | "published" | "archived"
  created_at: string
  updated_at: string
}

export async function createMovie(formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const date = formData.get("date") as string
    const time = formData.get("time") as string
    const cover_image_url = formData.get("cover_image_url") as string
    const trailer_youtube_url = formData.get("trailer_youtube_url") as string
    const fsk = formData.get("fsk") as string
    const status = formData.get("status") as "draft" | "published"

    const { data, error } = await supabase
      .from("movies")
      .insert({
        title,
        description: description || null,
        date,
        time: time || null,
        cover_image_url: cover_image_url || null,
        trailer_youtube_url: trailer_youtube_url || null,
        fsk: fsk || null,
        status,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/movies")
    revalidatePath("/kino")

    return { success: true, data, message: "Film erfolgreich erstellt" }
  } catch (error) {
    console.error("Error creating movie:", error)
    return { success: false, error: "Fehler beim Erstellen des Films" }
  }
}

export async function updateMovie(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const date = formData.get("date") as string
    const time = formData.get("time") as string
    const cover_image_url = formData.get("cover_image_url") as string
    const trailer_youtube_url = formData.get("trailer_youtube_url") as string
    const fsk = formData.get("fsk") as string
    const status = formData.get("status") as "draft" | "published" | "archived"

    const { data, error } = await supabase
      .from("movies")
      .update({
        title,
        description: description || null,
        date,
        time: time || null,
        cover_image_url: cover_image_url || null,
        trailer_youtube_url: trailer_youtube_url || null,
        fsk: fsk || null,
        status,
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/movies")
    revalidatePath("/kino")

    return { success: true, data, message: "Film erfolgreich aktualisiert" }
  } catch (error) {
    console.error("Error updating movie:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Films" }
  }
}

export async function deleteMovie(id: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("movies").delete().eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/movies")
    revalidatePath("/kino")

    return { success: true, message: "Film erfolgreich gelöscht" }
  } catch (error) {
    console.error("Error deleting movie:", error)
    return { success: false, error: "Fehler beim Löschen des Films" }
  }
}

export async function togglePublishMovie(id: string, currentStatus: string) {
  try {
    const supabase = await createClient()

    const newStatus = currentStatus === "published" ? "draft" : "published"

    const { error } = await supabase
      .from("movies")
      .update({ status: newStatus })
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/movies")
    revalidatePath("/kino")

    return {
      success: true,
      message:
        newStatus === "published"
          ? "Film wurde veröffentlicht"
          : "Film als Entwurf gespeichert",
    }
  } catch (error) {
    console.error("Error toggling movie status:", error)
    return { success: false, error: "Fehler beim Ändern des Status" }
  }
}
