import { supabase } from "@/lib/supabase"

export interface DocumentationChapter {
  id: string
  title: string
  slug: string
  pdf_url: string
  storage_path: string
  display_order: number
  created_at: string
  updated_at: string
}

/** All chapters in display order (public + admin reads). */
export async function getChapters(): Promise<DocumentationChapter[]> {
  const { data, error } = await supabase
    .from("documentation_chapters")
    .select("*")
    .order("display_order", { ascending: true })

  if (error) {
    console.error("Error fetching documentation chapters:", error)
    return []
  }

  return data || []
}

/** Single chapter by slug for the public reader. Returns null if not found. */
export async function getChapterBySlug(
  slug: string
): Promise<DocumentationChapter | null> {
  const { data, error } = await supabase
    .from("documentation_chapters")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    console.error("Error fetching documentation chapter:", error)
    return null
  }

  return data
}
