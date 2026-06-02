"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"

const BUCKET = "documentation"

// Generate URL-friendly slug from title (matches the news action convention).
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

// Ensure the slug is unique, appending -2, -3, … on collision.
async function uniqueSlug(
  supabase: ReturnType<typeof createAdminClient>,
  base: string,
  ignoreId?: string
): Promise<string> {
  const root = base || "kapitel"
  let candidate = root
  let n = 1
  // Loop until we find a slug not used by another row.
  while (true) {
    const { data } = await supabase
      .from("documentation_chapters")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle()
    if (!data || data.id === ignoreId) return candidate
    n += 1
    candidate = `${root}-${n}`
  }
}

// Sanitize a filename for use inside a storage object path.
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "datei.pdf"
}

/**
 * Mint a signed upload URL so the browser can upload the PDF DIRECTLY to
 * Supabase Storage, bypassing the Vercel/Next Server Action body limit (~4.5MB)
 * that otherwise causes a 413. Admin-gated: only this action (service-role) can
 * create the token, so the bucket needs no public-write policy.
 * Pass `chapterId` when replacing an existing chapter's file to reuse its folder.
 */
export async function createChapterUploadTarget(fileName: string, chapterId?: string) {
  try {
    const supabase = createAdminClient()

    const id = chapterId || randomUUID()
    const path = `chapters/${id}/${Date.now()}-${safeName(fileName)}`

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path)
    if (error) throw error

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

    return {
      success: true as const,
      id,
      path,
      token: data.token,
      publicUrl: pub.publicUrl,
    }
  } catch (error) {
    console.error("Error creating upload target:", error)
    return { success: false as const, error: "Fehler beim Vorbereiten des Uploads" }
  }
}

/** Insert a chapter row after the browser has uploaded the PDF via signed URL. */
export async function finalizeCreateChapter(args: {
  id: string
  title: string
  storage_path: string
  pdf_url: string
}) {
  try {
    const supabase = createAdminClient()

    const title = args.title?.trim()
    if (!title) return { success: false, error: "Titel ist erforderlich" }

    const slug = await uniqueSlug(supabase, generateSlug(title))

    // Next display_order = current max + 1.
    const { data: last } = await supabase
      .from("documentation_chapters")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    const display_order = (last?.display_order ?? -1) + 1

    const { data, error } = await supabase
      .from("documentation_chapters")
      .insert({
        id: args.id,
        title,
        slug,
        pdf_url: args.pdf_url,
        storage_path: args.storage_path,
        display_order,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath("/dokumentation")
    revalidatePath("/admin/dashboard/dokumentation")

    return { success: true, data, message: "Kapitel erstellt" }
  } catch (error) {
    console.error("Error creating chapter:", error)
    return { success: false, error: "Fehler beim Erstellen des Kapitels" }
  }
}

/**
 * Update a chapter's title and, optionally, swap its PDF. The new file (if any)
 * has already been uploaded by the browser via a signed URL; pass its
 * storage_path/pdf_url to switch and delete the old object.
 */
export async function finalizeUpdateChapter(
  id: string,
  args: { title: string; storage_path?: string; pdf_url?: string }
) {
  try {
    const supabase = createAdminClient()

    const title = args.title?.trim()
    if (!title) return { success: false, error: "Titel ist erforderlich" }

    const { data: current } = await supabase
      .from("documentation_chapters")
      .select("storage_path")
      .eq("id", id)
      .single()

    const updates: Record<string, unknown> = {
      title,
      slug: await uniqueSlug(supabase, generateSlug(title), id),
      updated_at: new Date().toISOString(),
    }

    if (args.storage_path && args.pdf_url) {
      updates.pdf_url = args.pdf_url
      updates.storage_path = args.storage_path
      if (current?.storage_path && current.storage_path !== args.storage_path) {
        await supabase.storage.from(BUCKET).remove([current.storage_path])
      }
    }

    const { data, error } = await supabase
      .from("documentation_chapters")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/dokumentation")
    revalidatePath("/admin/dashboard/dokumentation")

    return { success: true, data, message: "Kapitel aktualisiert" }
  } catch (error) {
    console.error("Error updating chapter:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Kapitels" }
  }
}

export async function deleteChapter(id: string) {
  try {
    const supabase = createAdminClient()

    const { data: current } = await supabase
      .from("documentation_chapters")
      .select("storage_path")
      .eq("id", id)
      .single()

    if (current?.storage_path) {
      await supabase.storage.from(BUCKET).remove([current.storage_path])
    }

    const { error } = await supabase.from("documentation_chapters").delete().eq("id", id)
    if (error) throw error

    revalidatePath("/dokumentation")
    revalidatePath("/admin/dashboard/dokumentation")

    return { success: true, message: "Kapitel gelöscht" }
  } catch (error) {
    console.error("Error deleting chapter:", error)
    return { success: false, error: "Fehler beim Löschen des Kapitels" }
  }
}

// Swap display_order with the adjacent chapter in the given direction.
export async function reorderChapter(id: string, direction: "up" | "down") {
  try {
    const supabase = createAdminClient()

    const { data: chapters, error } = await supabase
      .from("documentation_chapters")
      .select("id, display_order")
      .order("display_order", { ascending: true })

    if (error) throw error
    if (!chapters) return { success: false, error: "Keine Kapitel gefunden" }

    const idx = chapters.findIndex((c) => c.id === id)
    if (idx === -1) return { success: false, error: "Kapitel nicht gefunden" }

    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= chapters.length) {
      return { success: true } // already at the edge — no-op
    }

    const a = chapters[idx]
    const b = chapters[swapIdx]

    // Swap the two display_order values.
    await supabase.from("documentation_chapters").update({ display_order: b.display_order }).eq("id", a.id)
    await supabase.from("documentation_chapters").update({ display_order: a.display_order }).eq("id", b.id)

    revalidatePath("/dokumentation")
    revalidatePath("/admin/dashboard/dokumentation")

    return { success: true }
  } catch (error) {
    console.error("Error reordering chapter:", error)
    return { success: false, error: "Fehler beim Sortieren" }
  }
}
