"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { PostCategory } from "@/types/post"

export interface FlaggedPost {
  id: string
  wallet_address: string
  content: string
  media_urls: string[]
  video_url: string | null
  category: PostCategory
  created_at: string
  updated_at: string
  author_username: string | null
  author_profile_picture_url: string | null
  report_count: number
  reports: { reporter: string; reason: string | null; created_at: string }[]
}

export async function getFlaggedPosts(): Promise<{
  success: boolean
  data?: FlaggedPost[]
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { data: posts, error } = await supabase
      .from("posts")
      .select("*")
      .eq("status", "flagged")
      .order("updated_at", { ascending: false })

    if (error) throw error
    if (!posts || posts.length === 0) return { success: true, data: [] }

    // Batch fetch author info
    const addresses = [...new Set(posts.map((p: Record<string, unknown>) => p.wallet_address as string))]
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

    // Batch fetch reports
    const postIds = posts.map((p: Record<string, unknown>) => p.id as string)
    const { data: allReports } = await supabase
      .from("post_reports")
      .select("post_id, reporter_wallet_address, reason, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: false })

    const reportsMap = new Map<string, { reporter: string; reason: string | null; created_at: string }[]>()
    for (const r of allReports || []) {
      const pid = r.post_id as string
      if (!reportsMap.has(pid)) reportsMap.set(pid, [])
      reportsMap.get(pid)!.push({
        reporter: r.reporter_wallet_address as string,
        reason: r.reason as string | null,
        created_at: r.created_at as string,
      })
    }

    const result: FlaggedPost[] = posts.map((row: Record<string, unknown>) => {
      const author = authorMap.get(row.wallet_address as string)
      const reports = reportsMap.get(row.id as string) || []
      return {
        id: row.id as string,
        wallet_address: row.wallet_address as string,
        content: row.content as string,
        media_urls: (row.media_urls as string[]) || [],
        video_url: (row.video_url as string) || null,
        category: ((row.category as string) || "generell") as PostCategory,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        author_username: (author?.username as string) || null,
        author_profile_picture_url: (author?.profile_picture_url as string) || null,
        report_count: reports.length,
        reports,
      }
    })

    return { success: true, data: result }
  } catch (error) {
    console.error("Error fetching flagged posts:", error)
    return { success: false, error: "Fehler beim Laden der gemeldeten Beiträge" }
  }
}

export async function restoreFlaggedPost(
  postId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc("admin_restore_post", { p_post_id: postId })
    if (error) throw error

    revalidatePath("/admin/dashboard/flagged-posts")
    revalidatePath("/app")
    return { success: true }
  } catch (error) {
    console.error("Error restoring post:", error)
    return { success: false, error: "Fehler beim Wiederherstellen" }
  }
}

export async function deleteFlaggedPost(
  postId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc("admin_delete_post", { p_post_id: postId })
    if (error) throw error

    revalidatePath("/admin/dashboard/flagged-posts")
    revalidatePath("/app")
    return { success: true }
  } catch (error) {
    console.error("Error deleting post:", error)
    return { success: false, error: "Fehler beim Löschen" }
  }
}
