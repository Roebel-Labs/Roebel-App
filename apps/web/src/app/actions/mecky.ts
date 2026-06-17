"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { MeckyDraft } from "@/types/mecky"
import { generateMeckyDrafts } from "@/app/api/cron/mecky/generate"
import { createAppNotification } from "@/app/actions/app-notifications"

const MECKY_WALLET = "mecky_bot"

export async function triggerMeckyGeneration(): Promise<{
  success: boolean
  message: string
  count?: number
}> {
  try {
    const result = await generateMeckyDrafts({ skipDedup: true })

    revalidatePath("/admin/dashboard/mecky")

    return {
      success: result.success,
      message: result.message,
      count: result.count,
    }
  } catch (error) {
    console.error("Error triggering Mecky generation:", error)
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unbekannter Fehler",
    }
  }
}

export async function getMeckyDrafts(
  status?: string
): Promise<{ success: boolean; data?: MeckyDraft[]; error?: string }> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from("mecky_drafts")
      .select("*")
      .order("created_at", { ascending: false })

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    const { data, error } = await query

    if (error) throw error

    return { success: true, data: (data as MeckyDraft[]) || [] }
  } catch (error) {
    console.error("Error fetching Mecky drafts:", error)
    return { success: false, error: "Fehler beim Laden der Mecky-Vorschläge" }
  }
}

export async function approveMeckyDraft(
  draftId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // 1. Fetch the draft
    const { data: draft, error: fetchError } = await supabase
      .from("mecky_drafts")
      .select("*")
      .eq("id", draftId)
      .eq("status", "pending")
      .single()

    if (fetchError || !draft) {
      return {
        success: false,
        error: "Vorschlag nicht gefunden oder bereits bearbeitet",
      }
    }

    // 2. Insert into posts table as published
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        wallet_address: MECKY_WALLET,
        content: draft.content,
        media_urls: [],
        video_url: null,
      })
      .select()
      .single()

    if (postError) throw postError

    // 3. Insert link preview into post_links if source URL exists
    if (draft.source_url) {
      await supabase.from("post_links").insert({
        post_id: post.id,
        url: draft.source_url,
        og_title: draft.og_title || draft.source_title,
        og_description: draft.og_description,
        og_image: draft.og_image,
        og_site_name: draft.og_site_name || draft.source_site,
      })
    }

    // 4. Update draft as approved
    const { error: updateError } = await supabase
      .from("mecky_drafts")
      .update({
        status: "approved",
        approved_post_id: post.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", draftId)

    if (updateError) throw updateError

    // Create activity notification for the new Mecky post
    createAppNotification({
      type: "post_new",
      title: "Mecky: Neues aus der Region",
      body: draft.content?.substring(0, 120) || null,
      link: `/app/posts/${post.id}`,
      reference_id: post.id,
      image_url: "/mecky/mecky.png",
    }).catch(console.error)

    revalidatePath("/app")
    revalidatePath("/admin/dashboard/mecky")

    return { success: true }
  } catch (error) {
    console.error("Error approving Mecky draft:", error)
    return { success: false, error: "Fehler beim Genehmigen des Vorschlags" }
  }
}

export async function rejectMeckyDraft(
  draftId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("mecky_drafts")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("status", "pending")

    if (error) throw error

    revalidatePath("/admin/dashboard/mecky")

    return { success: true }
  } catch (error) {
    console.error("Error rejecting Mecky draft:", error)
    return { success: false, error: "Fehler beim Ablehnen des Vorschlags" }
  }
}

export async function deleteMeckyDraft(
  draftId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Fetch the draft to find out if it was already published as a post
    const { data: draft, error: fetchError } = await supabase
      .from("mecky_drafts")
      .select("id, approved_post_id")
      .eq("id", draftId)
      .single()

    if (fetchError || !draft) {
      return { success: false, error: "Vorschlag nicht gefunden" }
    }

    // If approved, also take the published post down from the feed
    if (draft.approved_post_id) {
      const { error: postError } = await supabase.rpc("admin_delete_post", {
        p_post_id: draft.approved_post_id,
      })
      if (postError) throw postError
    }

    // Permanently remove the draft row
    const { error: deleteError } = await supabase
      .from("mecky_drafts")
      .delete()
      .eq("id", draftId)

    if (deleteError) throw deleteError

    revalidatePath("/admin/dashboard/mecky")
    revalidatePath("/app")

    return { success: true }
  } catch (error) {
    console.error("Error deleting Mecky draft:", error)
    return { success: false, error: "Fehler beim Löschen des Vorschlags" }
  }
}
