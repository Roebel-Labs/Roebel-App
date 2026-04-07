"use server"

import { createClient } from "@/lib/supabase/server"
import type { SearchResultItem, SearchResults } from "@/types/search"

export async function globalSearch(
  query: string
): Promise<{ success: boolean; data?: SearchResults; error?: string }> {
  if (!query || query.trim().length < 2) {
    return { success: true, data: {} }
  }

  const q = query.trim()
  const limit = 5

  try {
    const supabase = await createClient()

    const [
      eventsResult,
      newsResult,
      businessesResult,
      marketplaceResult,
      boardResult,
      postsResult,
      proposalsResult,
      dealsResult,
      usersResult,
    ] = await Promise.allSettled([
      // Events
      supabase
        .from("events")
        .select("id, title, description, image_url, date")
        .eq("status", "approved")
        .or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`)
        .order("date", { ascending: false })
        .limit(limit),

      // News
      supabase
        .from("news_articles")
        .select("id, title, slug, excerpt, cover_image_url")
        .eq("status", "published")
        .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%`)
        .order("published_at", { ascending: false })
        .limit(limit),

      // Businesses
      supabase
        .from("businesses")
        .select("id, name, slug, description, logo_url, category")
        .eq("status", "published")
        .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
        .order("is_featured", { ascending: false })
        .limit(limit),

      // Marketplace (products + services, not board)
      supabase
        .from("marketplace_listings")
        .select("id, title, description, media_urls, price")
        .eq("status", "active")
        .neq("listing_type", "schwarzes_brett")
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(limit),

      // Board (Schwarzes Brett)
      supabase
        .from("marketplace_listings")
        .select("id, title, description, media_urls")
        .eq("status", "active")
        .eq("listing_type", "schwarzes_brett")
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(limit),

      // Posts
      supabase
        .from("posts")
        .select("id, content, wallet_address, created_at")
        .eq("status", "published")
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(limit),

      // Proposals
      supabase
        .from("proposals")
        .select("id, proposal_id, title, summary, proposal_number")
        .or(`title.ilike.%${q}%,summary.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(limit),

      // Deals (business_deals with business info)
      supabase
        .from("business_deals")
        .select("id, title, description, image_url, businesses!inner(name, slug)")
        .eq("is_active", true)
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(limit),

      // Users
      supabase
        .from("users")
        .select("wallet_address, username, profile_picture_url, neighborhood")
        .or(`username.ilike.%${q}%,neighborhood.ilike.%${q}%`)
        .limit(limit),
    ])

    const results: SearchResults = {}

    // Map events
    if (eventsResult.status === "fulfilled" && eventsResult.value.data) {
      const items = eventsResult.value.data.map((e: Record<string, unknown>): SearchResultItem => ({
        id: e.id as string,
        type: "events",
        title: e.title as string,
        subtitle: e.date ? formatDate(e.date as string) : null,
        imageUrl: (e.image_url as string) || null,
        href: `/app/events/${e.id}`,
      }))
      if (items.length > 0) results.events = items
    }

    // Map news
    if (newsResult.status === "fulfilled" && newsResult.value.data) {
      const items = newsResult.value.data.map((n: Record<string, unknown>): SearchResultItem => ({
        id: n.id as string,
        type: "news",
        title: n.title as string,
        subtitle: truncate(n.excerpt as string | null, 80),
        imageUrl: (n.cover_image_url as string) || null,
        href: `/app/news/${n.slug}`,
      }))
      if (items.length > 0) results.news = items
    }

    // Map businesses
    if (businessesResult.status === "fulfilled" && businessesResult.value.data) {
      const items = businessesResult.value.data.map((b: Record<string, unknown>): SearchResultItem => ({
        id: b.id as string,
        type: "businesses",
        title: b.name as string,
        subtitle: truncate(b.description as string | null, 80),
        imageUrl: (b.logo_url as string) || null,
        href: `/app/gewerbe/${b.slug}`,
      }))
      if (items.length > 0) results.businesses = items
    }

    // Map marketplace
    if (marketplaceResult.status === "fulfilled" && marketplaceResult.value.data) {
      const items = marketplaceResult.value.data.map((m: Record<string, unknown>): SearchResultItem => ({
        id: m.id as string,
        type: "marketplace",
        title: m.title as string,
        subtitle: m.price ? `${Number(m.price).toFixed(2)} €` : null,
        imageUrl: Array.isArray(m.media_urls) && m.media_urls.length > 0 ? m.media_urls[0] as string : null,
        href: `/app/marktplatz/${m.id}`,
      }))
      if (items.length > 0) results.marketplace = items
    }

    // Map board (Schwarzes Brett)
    if (boardResult.status === "fulfilled" && boardResult.value.data) {
      const items = boardResult.value.data.map((m: Record<string, unknown>): SearchResultItem => ({
        id: m.id as string,
        type: "board",
        title: m.title as string,
        subtitle: truncate(m.description as string | null, 80),
        imageUrl: Array.isArray(m.media_urls) && m.media_urls.length > 0 ? m.media_urls[0] as string : null,
        href: `/app/marktplatz/${m.id}`,
      }))
      if (items.length > 0) results.board = items
    }

    // Map posts
    if (postsResult.status === "fulfilled" && postsResult.value.data) {
      const items = postsResult.value.data.map((p: Record<string, unknown>): SearchResultItem => ({
        id: p.id as string,
        type: "posts",
        title: truncate(p.content as string, 60) || "Beitrag",
        subtitle: formatDate(p.created_at as string),
        imageUrl: null,
        href: `/app`,
      }))
      if (items.length > 0) results.posts = items
    }

    // Map proposals
    if (proposalsResult.status === "fulfilled" && proposalsResult.value.data) {
      const items = proposalsResult.value.data.map((p: Record<string, unknown>): SearchResultItem => ({
        id: (p.proposal_id as string) || (p.id as string),
        type: "proposals",
        title: (p.title as string) || `Vorschlag #${p.proposal_number}`,
        subtitle: truncate(p.summary as string | null, 80),
        imageUrl: null,
        href: `/app/proposals/${p.proposal_id || p.id}`,
      }))
      if (items.length > 0) results.proposals = items
    }

    // Map deals
    if (dealsResult.status === "fulfilled" && dealsResult.value.data) {
      const items = dealsResult.value.data.map((d: Record<string, unknown>): SearchResultItem => ({
        id: d.id as string,
        type: "deals",
        title: d.title as string,
        subtitle: (d.businesses as Record<string, unknown>)?.name as string || null,
        imageUrl: (d.image_url as string) || null,
        href: `/app/angebote/${d.id}`,
      }))
      if (items.length > 0) results.deals = items
    }

    // Map users
    if (usersResult.status === "fulfilled" && usersResult.value.data) {
      const items = usersResult.value.data
        .filter((u: Record<string, unknown>) => u.username)
        .map((u: Record<string, unknown>): SearchResultItem => ({
          id: u.wallet_address as string,
          type: "users",
          title: u.username as string,
          subtitle: (u.neighborhood as string) || null,
          imageUrl: (u.profile_picture_url as string) || null,
          href: `/app/profile/${u.wallet_address}`,
        }))
      if (items.length > 0) results.users = items
    }

    return { success: true, data: results }
  } catch (error) {
    console.error("Global search error:", error)
    return { success: false, error: "Fehler bei der Suche" }
  }
}

function truncate(text: string | null, maxLength: number): string | null {
  if (!text) return null
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + "..."
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return dateStr
  }
}
