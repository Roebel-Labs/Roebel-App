// RSS feed of the "Was ist neu" posts.
import { createAdminClient } from "@/lib/supabase/admin"
import { hasSupabase } from "@/lib/record"
import { APP_UPDATE_CATEGORY } from "@/lib/app-updates/commits"

export const runtime = "nodejs"
export const revalidate = 900

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"

function xml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export async function GET() {
  let items = ""
  if (hasSupabase) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("news_articles")
      .select("slug, title, excerpt, published_at")
      .eq("status", "published")
      .eq("category", APP_UPDATE_CATEGORY)
      .order("published_at", { ascending: false })
      .limit(50)
    if (error) console.error("[Neu] feed fetch failed:", error.message)
    items = (data ?? [])
      .map((row) => {
        const link = `${BASE_URL}/news/${row.slug}`
        return `<item><title>${xml(row.title)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid><pubDate>${new Date(row.published_at).toUTCString()}</pubDate><description>${xml(row.excerpt)}</description></item>`
      })
      .join("")
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Röbel App: Was ist neu</title><link>${BASE_URL}/neu</link><description>Neuerungen der Röbel App</description><language>de-DE</language>${items}</channel></rss>`
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } })
}
