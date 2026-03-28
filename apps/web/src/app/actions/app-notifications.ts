"use server"

import { createClient } from "@/lib/supabase/server"
import type { AppNotificationType, AppNotification, UnifiedNotification } from "@/types/app-notifications"

// ============================================
// Create
// ============================================

export async function createAppNotification(input: {
  type: AppNotificationType
  title: string
  body?: string | null
  link?: string | null
  reference_id?: string | null
  image_url?: string | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("app_notifications").insert({
      type: input.type,
      title: input.title,
      body: input.body || null,
      link: input.link || null,
      reference_id: input.reference_id || null,
      image_url: input.image_url || null,
    })

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error("Error creating app notification:", error)
    return { success: false, error: "Fehler beim Erstellen der Benachrichtigung" }
  }
}

// ============================================
// Read
// ============================================

export async function getAppNotifications(params?: {
  limit?: number
  offset?: number
}): Promise<{ success: boolean; data?: AppNotification[]; total?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const limit = params?.limit || 20
    const offset = params?.offset || 0

    const { data, error, count } = await supabase
      .from("app_notifications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return {
      success: true,
      data: (data || []) as AppNotification[],
      total: count || 0,
    }
  } catch (error) {
    console.error("Error fetching app notifications:", error)
    return { success: false, error: "Fehler beim Laden der Benachrichtigungen" }
  }
}

// ============================================
// Unified (merge push + activity notifications)
// ============================================

export async function getUnifiedNotifications(params?: {
  limit?: number
  offset?: number
}): Promise<{ success: boolean; data?: UnifiedNotification[]; total?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const limit = params?.limit || 20
    const offset = params?.offset || 0

    // Fetch extra from each source to allow proper merged sorting
    const fetchLimit = limit + offset

    const [pushResult, activityResult] = await Promise.allSettled([
      supabase
        .from("notification_log")
        .select("id, title, body, notification_type, created_at, data", { count: "exact" })
        .in("status", ["sent", "partial"])
        .order("created_at", { ascending: false })
        .limit(fetchLimit),

      supabase
        .from("app_notifications")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(fetchLimit),
    ])

    const unified: UnifiedNotification[] = []
    let totalPush = 0
    let totalActivity = 0

    // Map push notifications
    if (pushResult.status === "fulfilled" && pushResult.value.data) {
      totalPush = pushResult.value.count || 0
      for (const n of pushResult.value.data) {
        const data = n.data as Record<string, unknown> | null
        let link: string | null = null
        if (data?.type === "event" && data?.eventId) {
          link = `/app/events/${data.eventId}`
        } else if (data?.type === "news" && data?.slug) {
          link = `/app/news/${data.slug}`
        }

        unified.push({
          id: n.id as string,
          source: "push",
          title: n.title as string,
          body: (n.body as string) || null,
          type: n.notification_type as string,
          link,
          image_url: "/mecky/mecky.png",
          created_at: n.created_at as string,
        })
      }
    }

    // Map activity notifications
    if (activityResult.status === "fulfilled" && activityResult.value.data) {
      totalActivity = activityResult.value.count || 0
      for (const n of activityResult.value.data) {
        unified.push({
          id: n.id as string,
          source: "activity",
          title: n.title as string,
          body: (n.body as string) || null,
          type: n.type as string,
          link: (n.link as string) || null,
          image_url: (n.image_url as string) || null,
          created_at: n.created_at as string,
        })
      }
    }

    // Sort by created_at descending and paginate
    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const paginated = unified.slice(offset, offset + limit)

    return {
      success: true,
      data: paginated,
      total: totalPush + totalActivity,
    }
  } catch (error) {
    console.error("Error fetching unified notifications:", error)
    return { success: false, error: "Fehler beim Laden der Benachrichtigungen" }
  }
}
