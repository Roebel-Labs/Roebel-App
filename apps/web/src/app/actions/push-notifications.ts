"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type {
  PushToken,
  NotificationLogEntry,
  PushNotificationStats,
  SendNotificationPayload,
  NotificationLogFilter,
  DeviceFilter,
} from "@/types/push-notifications"

// Public notification type (for user-facing pages)
export interface PublicNotification {
  id: string
  title: string
  body: string
  notification_type: string
  created_at: string
  data: Record<string, unknown> | null
}

// Get public notifications (for user-facing notification pages)
export async function getPublicNotifications(params?: {
  limit?: number
  offset?: number
}): Promise<{
  success: boolean
  data?: PublicNotification[]
  total?: number
  error?: string
}> {
  try {
    const supabase = await createClient()
    const limit = params?.limit || 20
    const offset = params?.offset || 0

    const { data, error, count } = await supabase
      .from("notification_log")
      .select("id, title, body, notification_type, created_at, data", { count: "exact" })
      .in("status", ["sent", "partial"])
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return {
      success: true,
      data: (data || []) as PublicNotification[],
      total: count || 0,
    }
  } catch (error) {
    console.error("Error fetching public notifications:", error)
    return { success: false, error: "Fehler beim Laden der Benachrichtigungen" }
  }
}

// Get dashboard statistics
export async function getNotificationStats(): Promise<{
  success: boolean
  data?: PushNotificationStats
  error?: string
}> {
  try {
    const supabase = await createClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [
      totalDevicesResult,
      activeDevicesResult,
      iosDevicesResult,
      androidDevicesResult,
      sentTodayResult,
      failedTodayResult,
      eventsEnabledResult,
      newsEnabledResult,
    ] = await Promise.all([
      // Total devices
      supabase.from("push_tokens").select("id", { count: "exact", head: true }),
      // Active devices
      supabase.from("push_tokens").select("id", { count: "exact", head: true }).eq("is_active", true),
      // iOS devices
      supabase.from("push_tokens").select("id", { count: "exact", head: true }).eq("platform", "ios").eq("is_active", true),
      // Android devices
      supabase.from("push_tokens").select("id", { count: "exact", head: true }).eq("platform", "android").eq("is_active", true),
      // Sent today
      supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString())
        .in("status", ["sent", "partial"]),
      // Failed today
      supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString())
        .eq("status", "failed"),
      // Events enabled
      supabase.from("notification_preferences").select("id", { count: "exact", head: true }).eq("events_enabled", true),
      // News enabled
      supabase.from("notification_preferences").select("id", { count: "exact", head: true }).eq("news_enabled", true),
    ])

    return {
      success: true,
      data: {
        totalDevices: totalDevicesResult.count || 0,
        activeDevices: activeDevicesResult.count || 0,
        iosDevices: iosDevicesResult.count || 0,
        androidDevices: androidDevicesResult.count || 0,
        sentToday: sentTodayResult.count || 0,
        failedToday: failedTodayResult.count || 0,
        eventsEnabled: eventsEnabledResult.count || 0,
        newsEnabled: newsEnabledResult.count || 0,
      },
    }
  } catch (error) {
    console.error("Error fetching notification stats:", error)
    return { success: false, error: "Fehler beim Laden der Statistiken" }
  }
}

// Get notification log with filters
export async function getNotificationLog(filters?: NotificationLogFilter): Promise<{
  success: boolean
  data?: NotificationLogEntry[]
  total?: number
  error?: string
}> {
  try {
    const supabase = await createClient()
    const limit = filters?.limit || 20
    const offset = filters?.offset || 0

    let query = supabase.from("notification_log").select("*", { count: "exact" })

    if (filters?.type) {
      query = query.eq("notification_type", filters.type)
    }
    if (filters?.status) {
      query = query.eq("status", filters.status)
    }
    if (filters?.startDate) {
      query = query.gte("created_at", filters.startDate)
    }
    if (filters?.endDate) {
      query = query.lte("created_at", filters.endDate)
    }

    const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1)

    if (error) throw error

    return {
      success: true,
      data: data as NotificationLogEntry[],
      total: count || 0,
    }
  } catch (error) {
    console.error("Error fetching notification log:", error)
    return { success: false, error: "Fehler beim Laden der Benachrichtigungen" }
  }
}

// Get recent notifications (for dashboard)
export async function getRecentNotifications(limit: number = 5): Promise<{
  success: boolean
  data?: NotificationLogEntry[]
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("notification_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error

    return { success: true, data: data as NotificationLogEntry[] }
  } catch (error) {
    console.error("Error fetching recent notifications:", error)
    return { success: false, error: "Fehler beim Laden der Benachrichtigungen" }
  }
}

// Get devices with filters
export async function getDevices(filters?: DeviceFilter): Promise<{
  success: boolean
  data?: PushToken[]
  total?: number
  error?: string
}> {
  try {
    const supabase = await createClient()
    const limit = filters?.limit || 20
    const offset = filters?.offset || 0

    let query = supabase.from("push_tokens").select("*", { count: "exact" })

    if (filters?.platform) {
      query = query.eq("platform", filters.platform)
    }
    if (filters?.isActive !== undefined) {
      query = query.eq("is_active", filters.isActive)
    }
    if (filters?.search) {
      query = query.ilike("device_id", `%${filters.search}%`)
    }

    const { data, error, count } = await query.order("last_used_at", { ascending: false }).range(offset, offset + limit - 1)

    if (error) throw error

    return {
      success: true,
      data: data as PushToken[],
      total: count || 0,
    }
  } catch (error) {
    console.error("Error fetching devices:", error)
    return { success: false, error: "Fehler beim Laden der Geräte" }
  }
}

// Deactivate a device token
export async function deactivateToken(deviceId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("push_tokens").update({ is_active: false }).eq("device_id", deviceId)

    if (error) throw error

    revalidatePath("/admin/dashboard/notifications/devices")

    return { success: true }
  } catch (error) {
    console.error("Error deactivating token:", error)
    return { success: false, error: "Fehler beim Deaktivieren des Tokens" }
  }
}

// Reactivate a device token
export async function reactivateToken(deviceId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("push_tokens").update({ is_active: true }).eq("device_id", deviceId)

    if (error) throw error

    revalidatePath("/admin/dashboard/notifications/devices")

    return { success: true }
  } catch (error) {
    console.error("Error reactivating token:", error)
    return { success: false, error: "Fehler beim Reaktivieren des Tokens" }
  }
}

// Get tokens for sending notifications
async function getTokensForNotification(
  payload: SendNotificationPayload
): Promise<{ tokens: string[]; error?: string }> {
  const supabase = await createClient()

  if (payload.type === "test" && payload.testToken) {
    return { tokens: [payload.testToken] }
  }

  if (payload.type === "broadcast") {
    const { data, error } = await supabase.from("push_tokens").select("expo_push_token").eq("is_active", true)

    if (error) {
      return { tokens: [], error: error.message }
    }

    return { tokens: data.map((d) => d.expo_push_token) }
  }

  if (payload.type === "category" && payload.categories && payload.categories.length > 0) {
    // Get device IDs that have events enabled and match at least one category
    const { data: prefs, error: prefsError } = await supabase
      .from("notification_preferences")
      .select("device_id, event_categories")
      .eq("events_enabled", true)

    if (prefsError) {
      return { tokens: [], error: prefsError.message }
    }

    // Filter by category match
    const matchingDeviceIds = prefs
      .filter((p) => {
        if (!p.event_categories) return false
        return payload.categories!.some((cat) => p.event_categories.includes(cat))
      })
      .map((p) => p.device_id)

    if (matchingDeviceIds.length === 0) {
      return { tokens: [] }
    }

    // Get tokens for matching devices
    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("expo_push_token")
      .in("device_id", matchingDeviceIds)
      .eq("is_active", true)

    if (tokensError) {
      return { tokens: [], error: tokensError.message }
    }

    return { tokens: tokens.map((t) => t.expo_push_token) }
  }

  return { tokens: [] }
}

// Send push notification
export async function sendPushNotification(payload: SendNotificationPayload): Promise<{
  success: boolean
  sent?: number
  failed?: number
  error?: string
}> {
  try {
    const supabase = await createClient()

    // Get tokens
    const { tokens, error: tokensError } = await getTokensForNotification(payload)

    if (tokensError) {
      return { success: false, error: tokensError }
    }

    if (tokens.length === 0) {
      return { success: false, error: "Keine Geräte gefunden für diese Benachrichtigung" }
    }

    // Create log entry first
    const { data: logEntry, error: logError } = await supabase
      .from("notification_log")
      .insert({
        notification_type: payload.type === "test" ? "test" : payload.type === "category" ? "category" : "broadcast",
        title: payload.title,
        body: payload.body,
        data: payload.data || null,
        tokens_sent: 0,
        tokens_failed: 0,
        status: "pending",
      })
      .select()
      .single()

    if (logError) {
      console.error("Error creating log entry:", logError)
    }

    // Send via Expo Push API
    console.log("Sending to Expo Push API:", tokens.length, "tokens")

    // Build messages for Expo Push API
    const messages = tokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: "default" as const,
      channelId: "default",
    }))

    // Batch send (Expo recommends max 100 per request)
    const BATCH_SIZE = 100
    let totalSent = 0
    let totalFailed = 0
    const invalidTokens: string[] = []
    const allTicketIds: string[] = []

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)

      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(batch),
        })

        const result = await response.json()
        const tickets = result.data || []

        console.log("Expo Push Response:", {
          ticketCount: tickets.length,
          errors: tickets.filter((t: { status: string }) => t.status === "error"),
        })

        for (let j = 0; j < tickets.length; j++) {
          const ticket = tickets[j]
          if (ticket.status === "ok") {
            totalSent++
            // Store ticket ID for later receipt fetching
            if (ticket.id) {
              allTicketIds.push(ticket.id)
            }
          } else {
            totalFailed++
            // Mark invalid tokens for deactivation
            if (ticket.details?.error === "DeviceNotRegistered") {
              invalidTokens.push(batch[j].to)
            }
          }
        }
      } catch (batchError) {
        console.error("Error sending batch:", batchError)
        totalFailed += batch.length
      }
    }

    // Deactivate invalid tokens
    if (invalidTokens.length > 0) {
      await supabase.from("push_tokens").update({ is_active: false }).in("expo_push_token", invalidTokens)
    }

    // Update log entry with ticket IDs for later receipt fetching
    const status = totalFailed === 0 ? "sent" : totalSent === 0 ? "failed" : "partial"

    if (logEntry) {
      await supabase
        .from("notification_log")
        .update({
          tokens_sent: totalSent,
          tokens_failed: totalFailed,
          status,
          expo_ticket_ids: allTicketIds.length > 0 ? allTicketIds : null,
        })
        .eq("id", logEntry.id)
    }

    revalidatePath("/admin/dashboard/notifications")
    revalidatePath("/admin/dashboard/notifications/history")

    return {
      success: totalSent > 0,
      sent: totalSent,
      failed: totalFailed,
      error: totalSent === 0 ? "Alle Benachrichtigungen fehlgeschlagen" : undefined,
    }
  } catch (error) {
    console.error("Error sending push notification:", error)
    return { success: false, error: "Fehler beim Senden der Benachrichtigung" }
  }
}

// Get count of failed notifications (for sidebar badge)
export async function getFailedNotificationCount(): Promise<number> {
  try {
    const supabase = await createClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today.toISOString())
      .in("status", ["failed", "partial"])

    return count || 0
  } catch (error) {
    console.error("Error fetching failed notification count:", error)
    return 0
  }
}

// Get delivery stats summary (for dashboard)
export async function getDeliveryStats(): Promise<{
  success: boolean
  data?: {
    totalDelivered: number
    totalFailed: number
    totalPending: number
  }
  error?: string
}> {
  try {
    const supabase = await createClient()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Get all notifications with delivery status from last 7 days
    const { data, error } = await supabase
      .from("notification_log")
      .select("delivery_status, tokens_sent")
      .gte("created_at", sevenDaysAgo.toISOString())
      .not("delivery_status", "is", null)

    if (error) throw error

    let totalDelivered = 0
    let totalFailed = 0
    let totalPending = 0

    for (const notification of data || []) {
      if (notification.delivery_status) {
        const status = notification.delivery_status as { delivered: number; failed: number; total: number }
        totalDelivered += status.delivered || 0
        totalFailed += status.failed || 0
        // Calculate pending as total tickets without receipts yet
        const pending = (status.total || 0) - (status.delivered || 0) - (status.failed || 0)
        totalPending += Math.max(0, pending)
      }
    }

    return {
      success: true,
      data: {
        totalDelivered,
        totalFailed,
        totalPending,
      },
    }
  } catch (error) {
    console.error("Error fetching delivery stats:", error)
    return { success: false, error: "Fehler beim Laden der Zustellungsstatistiken" }
  }
}

// Get approved events for dropdown selection
export async function getEventsForSelection(): Promise<{
  success: boolean
  data?: { id: string; title: string; date: string }[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("events")
      .select("id, title, date")
      .eq("status", "approved")
      .order("date", { ascending: false })
      .limit(50)

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("Error fetching events for selection:", error)
    return { success: false, error: "Fehler beim Laden der Events" }
  }
}

// Get published news articles for dropdown selection
export async function getNewsForSelection(): Promise<{
  success: boolean
  data?: { id: string; title: string; slug: string; published_at: string | null }[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("news_articles")
      .select("id, title, slug, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50)

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("Error fetching news for selection:", error)
    return { success: false, error: "Fehler beim Laden der News-Artikel" }
  }
}

// Fetch delivery receipts from Expo Push API
export async function fetchDeliveryReceipts(notificationId: string): Promise<{
  success: boolean
  delivered?: number
  failed?: number
  error?: string
}> {
  try {
    const supabase = await createClient()

    // Get ticket IDs from log
    const { data: log, error: logError } = await supabase
      .from("notification_log")
      .select("expo_ticket_ids")
      .eq("id", notificationId)
      .single()

    if (logError) throw logError

    if (!log?.expo_ticket_ids?.length) {
      return { success: false, error: "Keine Ticket-IDs verfügbar" }
    }

    // Fetch receipts from Expo (batch of 1000 max)
    const ticketIds = log.expo_ticket_ids
    let delivered = 0
    let failed = 0

    // Process in batches of 1000 (Expo limit)
    const RECEIPT_BATCH_SIZE = 1000
    for (let i = 0; i < ticketIds.length; i += RECEIPT_BATCH_SIZE) {
      const batchIds = ticketIds.slice(i, i + RECEIPT_BATCH_SIZE)

      const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ids: batchIds }),
      })

      const result = await response.json()
      const receipts = result.data || {}

      // Count delivery statuses
      for (const receipt of Object.values(receipts) as Array<{ status: string }>) {
        if (receipt.status === "ok") {
          delivered++
        } else {
          failed++
        }
      }
    }

    // Update log with delivery status
    const { error: updateError } = await supabase
      .from("notification_log")
      .update({
        delivery_status: {
          delivered,
          failed,
          total: ticketIds.length,
          last_checked: new Date().toISOString(),
        },
      })
      .eq("id", notificationId)

    if (updateError) {
      console.error("Error updating delivery status:", updateError)
    }

    revalidatePath("/admin/dashboard/notifications")
    revalidatePath("/admin/dashboard/notifications/history")

    return { success: true, delivered, failed }
  } catch (error) {
    console.error("Error fetching delivery receipts:", error)
    return { success: false, error: "Fehler beim Abrufen der Zustellungsdaten" }
  }
}
