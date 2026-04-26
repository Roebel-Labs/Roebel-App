"use server"

import { createClient } from "@/lib/supabase/server"

export interface NotificationCounts {
  events: number
  news: number
  feedback: number
  movies: number
  speisekarten: number
  pushNotifications: number
  businesses: number
  meckyDrafts: number
  flaggedPosts: number
  alerts: number
  externAccounts: number
}

export async function getNotificationCounts(): Promise<{
  success: boolean
  data?: NotificationCounts
  error?: string
}> {
  try {
    const supabase = await createClient()
    const now = new Date()
    const cutoffDate = new Date(now.getTime() - 48 * 60 * 60 * 1000) // 48 hours ago

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Run all queries in parallel for performance
    const [feedbackResult, eventsResult, newsResult, moviesResult, restaurantsResult, pushResult, businessesResult, meckyResult, flaggedPostsResult, alertsResult, externResult] = await Promise.all([
      // Feedback: count items with status='new'
      supabase
        .from("feedback")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),

      // Events: count items with status='pending' (awaiting approval)
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),

      // News: count draft articles
      supabase
        .from("news_articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),

      // Movies: count draft movies
      supabase
        .from("movies")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),

      // Restaurants: count items created in last 48 hours
      supabase
        .from("restaurants")
        .select("id", { count: "exact", head: true })
        .gte("created_at", cutoffDate.toISOString()),

      // Push notifications: count failed/partial today
      supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString())
        .in("status", ["failed", "partial"]),

      // Businesses: count pending approvals
      supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),

      // Mecky: count pending drafts
      supabase
        .from("mecky_drafts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),

      // Flagged posts: count posts pending review
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "flagged"),

      // Service alerts: count active alerts
      supabase
        .from("service_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),

      // Extern accounts: pending applications
      supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("is_extern", true)
        .eq("extern_status", "pending"),
    ])

    return {
      success: true,
      data: {
        feedback: feedbackResult.count || 0,
        events: eventsResult.count || 0,
        news: newsResult.count || 0,
        movies: moviesResult.count || 0,
        speisekarten: restaurantsResult.count || 0,
        pushNotifications: pushResult.count || 0,
        businesses: businessesResult.count || 0,
        meckyDrafts: meckyResult.count || 0,
        flaggedPosts: flaggedPostsResult.count || 0,
        alerts: alertsResult.count || 0,
        externAccounts: externResult.count || 0,
      },
    }
  } catch (error) {
    console.error("Error fetching notification counts:", error)
    return { success: false, error: "Failed to fetch notification counts" }
  }
}
