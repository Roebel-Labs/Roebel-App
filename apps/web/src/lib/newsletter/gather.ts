import { createAdminClient } from "@/lib/supabase/admin"

export interface NewsletterSourceData {
  windowStart: string
  news: Array<{ title: string; excerpt: string | null; category: string | null; slug: string }>
  events: Array<{ title: string; date: string; time: string | null; location: string | null }>
  proposals: Array<{ title: string; summary: string | null; state: string; for_votes: number; against_votes: number }>
  listings: Array<{ title: string; category: string | null }>
  businesses: Array<{ name: string }>
  posts: Array<{ content: string; likes_count: number }>
}

async function safe<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[Newsletter] gather source failed: ${label}`, err)
    return []
  }
}

export async function gatherNewsletterContent(): Promise<NewsletterSourceData> {
  const supabase = createAdminClient()

  // Window = since last sent issue, fallback 7 days
  const { data: lastSent } = await supabase
    .from("newsletter_issues")
    .select("sent_at")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const windowStart =
    lastSent?.sent_at ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const today = new Date().toISOString().slice(0, 10)
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [news, events, proposals, listings, businesses, posts] = await Promise.all([
    safe("news", async () => {
      const { data } = await supabase
        .from("news_articles")
        .select("title, excerpt, category, slug")
        .eq("status", "published")
        .gte("published_at", windowStart)
        .order("published_at", { ascending: false })
        .limit(10)
      return data ?? []
    }),
    safe("events", async () => {
      const { data } = await supabase
        .from("events")
        .select("title, date, time, location")
        .eq("status", "approved")
        .gte("date", today)
        .lte("date", in14Days)
        .order("date", { ascending: true })
        .limit(10)
      return data ?? []
    }),
    safe("proposals", async () => {
      const { data } = await supabase
        .from("proposals")
        .select("title, summary, state, for_votes, against_votes")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(10)
      return data ?? []
    }),
    safe("listings", async () => {
      const { data } = await supabase
        .from("marketplace_listings")
        .select("title, category")
        .eq("status", "active")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(10)
      return data ?? []
    }),
    safe("businesses", async () => {
      // NOTE: `businesses` has no `is_active` column (that belongs to `business_deals`).
      // The businesses table uses `status: "pending" | "published" | "rejected"`.
      const { data } = await supabase
        .from("businesses")
        .select("name")
        .eq("status", "published")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(5)
      return data ?? []
    }),
    safe("posts", async () => {
      // NOTE: `posts` is soft-deleted via `status` ("published" | "deleted"), independent
      // of `feed_type`. Filter status too so deleted posts never leak into the newsletter.
      const { data } = await supabase
        .from("posts")
        .select("content, likes_count")
        .eq("feed_type", "main")
        .eq("status", "published")
        .gte("created_at", windowStart)
        .order("likes_count", { ascending: false })
        .limit(5)
      return data ?? []
    }),
  ])

  return { windowStart, news, events, proposals, listings, businesses, posts }
}
