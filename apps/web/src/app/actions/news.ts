"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createAppNotification } from "@/app/actions/app-notifications"

export interface NewsArticle {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  cover_image_url: string | null
  author_name: string
  author_email: string | null
  category: string | null
  tags: string[] | null
  status: "draft" | "published" | "archived"
  is_featured: boolean
  view_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

// Generate URL-friendly slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function createNewsArticle(formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const excerpt = formData.get("excerpt") as string
    const content = formData.get("content") as string
    const cover_image_url = formData.get("cover_image_url") as string
    const author_name = formData.get("author_name") as string
    const author_email = formData.get("author_email") as string
    const category = formData.get("category") as string
    const tags = formData.get("tags") as string
    const status = formData.get("status") as "draft" | "published"
    const is_featured = formData.get("is_featured") === "true"

    const slug = generateSlug(title)
    const published_at = status === "published" ? new Date().toISOString() : null

    const { data, error } = await supabase
      .from("news_articles")
      .insert({
        title,
        slug,
        excerpt,
        content,
        cover_image_url: cover_image_url || null,
        author_name,
        author_email,
        category: category || null,
        tags: tags ? tags.split(",").map((t) => t.trim()) : null,
        status,
        is_featured,
        published_at,
      })
      .select()
      .single()

    if (error) throw error

    // Create activity notification if published
    if (status === "published") {
      createAppNotification({
        type: "news_new",
        title: `Neuer Artikel: ${title}`,
        body: excerpt?.substring(0, 120) || null,
        link: `/app/news/${slug}`,
        reference_id: data.id,
        image_url: cover_image_url || null,
      }).catch(console.error)
    }

    revalidatePath("/dashboard/news")
    revalidatePath("/news")

    return { success: true, data, message: "Artikel erfolgreich erstellt" }
  } catch (error) {
    console.error("Error creating news article:", error)
    return { success: false, error: "Fehler beim Erstellen des Artikels" }
  }
}

export async function updateNewsArticle(id: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const excerpt = formData.get("excerpt") as string
    const content = formData.get("content") as string
    const cover_image_url = formData.get("cover_image_url") as string
    const author_name = formData.get("author_name") as string
    const author_email = formData.get("author_email") as string
    const category = formData.get("category") as string
    const tags = formData.get("tags") as string
    const status = formData.get("status") as "draft" | "published"
    const is_featured = formData.get("is_featured") === "true"

    const slug = generateSlug(title)

    // Get current article to check if status changed
    const { data: currentArticle } = await supabase.from("news_articles").select("status, published_at").eq("id", id).single()

    const published_at =
      status === "published" && currentArticle?.status === "draft" ? new Date().toISOString() : currentArticle?.published_at

    const { data, error} = await supabase
      .from("news_articles")
      .update({
        title,
        slug,
        excerpt,
        content,
        cover_image_url: cover_image_url || null,
        author_name,
        author_email,
        category: category || null,
        tags: tags ? tags.split(",").map((t) => t.trim()) : null,
        status,
        is_featured,
        published_at,
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    // Create activity notification on draft→published transition
    if (status === "published" && currentArticle?.status === "draft") {
      createAppNotification({
        type: "news_new",
        title: `Neuer Artikel: ${title}`,
        body: excerpt?.substring(0, 120) || null,
        link: `/app/news/${slug}`,
        reference_id: data.id,
        image_url: cover_image_url || null,
      }).catch(console.error)
    }

    revalidatePath("/dashboard/news")
    revalidatePath(`/news/${slug}`)
    revalidatePath("/news")

    return { success: true, data, message: "Artikel erfolgreich aktualisiert" }
  } catch (error) {
    console.error("Error updating news article:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Artikels" }
  }
}

export async function deleteNewsArticle(id: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("news_articles").delete().eq("id", id)

    if (error) throw error

    revalidatePath("/dashboard/news")
    revalidatePath("/news")

    return { success: true, message: "Artikel erfolgreich gelöscht" }
  } catch (error) {
    console.error("Error deleting news article:", error)
    return { success: false, error: "Fehler beim Löschen des Artikels" }
  }
}

export async function toggleFeaturedArticle(id: string, is_featured: boolean) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("news_articles").update({ is_featured }).eq("id", id)

    if (error) throw error

    revalidatePath("/dashboard/news")
    revalidatePath("/news")

    return { success: true, message: is_featured ? "Als Featured markiert" : "Featured entfernt" }
  } catch (error) {
    console.error("Error toggling featured:", error)
    return { success: false, error: "Fehler beim Aktualisieren" }
  }
}

export async function incrementViewCount(id: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.rpc("increment_view_count", { article_id: id })

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error("Error incrementing view count:", error)
    return { success: false }
  }
}
