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

// Upload a PDF to the documentation bucket; returns { path, publicUrl }.
async function uploadPdf(
  supabase: ReturnType<typeof createAdminClient>,
  chapterId: string,
  file: File
): Promise<{ path: string; publicUrl: string }> {
  const path = `chapters/${chapterId}/${Date.now()}-${safeName(file.name)}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, publicUrl: data.publicUrl }
}

export async function createChapter(formData: FormData) {
  try {
    const supabase = createAdminClient()

    const title = (formData.get("title") as string)?.trim()
    const file = formData.get("pdf") as File | null

    if (!title) return { success: false, error: "Titel ist erforderlich" }
    if (!file || file.size === 0) return { success: false, error: "PDF-Datei ist erforderlich" }

    const id = randomUUID()
    const slug = await uniqueSlug(supabase, generateSlug(title))
    const { path, publicUrl } = await uploadPdf(supabase, id, file)

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
      .insert({ id, title, slug, pdf_url: publicUrl, storage_path: path, display_order })
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

export async function updateChapter(id: string, formData: FormData) {
  try {
    const supabase = createAdminClient()

    const title = (formData.get("title") as string)?.trim()
    const file = formData.get("pdf") as File | null

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

    // Optional PDF replace: upload new object, then delete the old one.
    if (file && file.size > 0) {
      const { path, publicUrl } = await uploadPdf(supabase, id, file)
      updates.pdf_url = publicUrl
      updates.storage_path = path
      if (current?.storage_path) {
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
