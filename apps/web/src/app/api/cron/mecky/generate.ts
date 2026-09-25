import { createAdminClient } from "@/lib/supabase/admin"
import {
  fetchAllFeeds,
  filterItemsInWindow,
  filterRecentItems,
  resolveTimeWindow,
  type MeckyTimeWindow,
} from "./rss"
import { generateMeckyPostFromLink, generateMeckyPosts } from "./prompt"

export interface GenerateResult {
  success: boolean
  message: string
  count?: number
  drafts?: Array<{ id: string; content: string; source: string | null }>
}

interface OgData {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

async function fetchOgMetadata(url: string): Promise<OgData> {
  const empty: OgData = {
    title: null,
    description: null,
    image: null,
    siteName: null,
  }
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    const ogRes = await fetch(
      `${baseUrl}/api/og-metadata?url=${encodeURIComponent(url)}`
    )
    const ogJson = await ogRes.json()
    if (ogJson.success && ogJson.data) {
      return {
        title: ogJson.data.title,
        description: ogJson.data.description,
        image: ogJson.data.image,
        siteName: ogJson.data.siteName,
      }
    }
  } catch (err) {
    console.warn("OG metadata fetch failed for", url, err)
  }
  return empty
}

export async function generateMeckyDrafts(options?: {
  skipDedup?: boolean
  /** Explicit publication window. Omitted (the daily cron) = last 48 hours. */
  window?: MeckyTimeWindow
}): Promise<GenerateResult> {
  const supabase = createAdminClient()

  // Check if we already have pending drafts from today (prevent double-runs)
  if (!options?.skipDedup) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count: pendingToday } = await supabase
      .from("mecky_drafts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", todayStart.toISOString())

    if (pendingToday && pendingToday >= 3) {
      return {
        success: true,
        message: "Already have 3+ pending drafts from today, skipping",
        count: 0,
      }
    }
  }

  // Fetch RSS feeds
  console.log("Fetching RSS feeds...")
  const allItems = await fetchAllFeeds()
  console.log(`Fetched ${allItems.length} total RSS items`)

  // Narrow to the requested publication window (default: last 48 hours)
  const window = options?.window ? resolveTimeWindow(options.window) : null
  const periodLabel = window?.label ?? "letzte 48 Stunden"
  const recentItems = window
    ? filterItemsInWindow(allItems, window)
    : filterRecentItems(allItems, 48)
  console.log(`${recentItems.length} items from ${periodLabel}`)

  if (recentItems.length === 0) {
    return {
      success: true,
      message: `Keine Nachrichten im Zeitraum "${periodLabel}" gefunden`,
      count: 0,
    }
  }

  // Deduplicate against existing drafts
  const guids = recentItems.map((item) => item.guid).filter(Boolean)

  const { data: existingDrafts } = await supabase
    .from("mecky_drafts")
    .select("rss_item_guid")
    .in("rss_item_guid", guids)

  const existingGuids = new Set(
    (existingDrafts || []).map((d) => d.rss_item_guid)
  )

  const newItems = recentItems.filter(
    (item) => !item.guid || !existingGuids.has(item.guid)
  )
  console.log(`${newItems.length} new items after deduplication`)

  if (newItems.length === 0) {
    return {
      success: true,
      message: `Alle Nachrichten aus "${periodLabel}" wurden bereits verarbeitet`,
      count: 0,
    }
  }

  // Generate posts with Claude
  console.log("Generating Mecky posts with Claude...")
  const proposals = await generateMeckyPosts(newItems, periodLabel)
  console.log(`Claude generated ${proposals.length} post proposals`)

  if (proposals.length === 0) {
    return {
      success: true,
      message: `Keine für Röbel/Müritz relevanten Nachrichten aus "${periodLabel}"`,
      count: 0,
    }
  }

  // Fetch OG metadata for source URLs and insert drafts
  const insertedDrafts: Array<{
    id: string
    content: string
    source: string | null
  }> = []

  for (const proposal of proposals) {
    const sourceArticle = newItems[proposal.source_index]
    if (!sourceArticle) continue

    const og = await fetchOgMetadata(sourceArticle.link)

    const { data, error } = await supabase
      .from("mecky_drafts")
      .insert({
        content: proposal.content,
        source_url: sourceArticle.link,
        source_title: sourceArticle.title,
        source_site: sourceArticle.site,
        source_published_at: sourceArticle.pubDate
          ? new Date(sourceArticle.pubDate).toISOString()
          : null,
        rss_item_guid: sourceArticle.guid || null,
        og_title: og.title,
        og_description: og.description,
        og_image: og.image,
        og_site_name: og.siteName,
      })
      .select()
      .single()

    if (error) {
      // Skip duplicate guid errors gracefully
      if (error.code === "23505") {
        console.log(`Skipping duplicate: ${sourceArticle.guid}`)
        continue
      }
      console.error("Error inserting draft:", error)
      continue
    }

    insertedDrafts.push({
      id: data.id,
      content: data.content,
      source: data.source_site,
    })
  }

  return {
    success: true,
    message: `${insertedDrafts.length} Mecky-Vorschläge aus "${periodLabel}" generiert`,
    count: insertedDrafts.length,
    drafts: insertedDrafts,
  }
}

/**
 * Pending draft for one article an admin pasted by link: for sources Mecky
 * has no feed for (e.g. Nordkurier). The link itself is the dedup key.
 */
export async function createMeckyDraftFromLink(
  rawUrl: string,
  notes?: string
): Promise<GenerateResult> {
  let url: string
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("bad protocol")
    }
    url = parsed.href
  } catch {
    return { success: false, message: "Ungültiger Link" }
  }

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from("mecky_drafts")
    .select("id")
    .eq("rss_item_guid", url)
    .maybeSingle()
  if (existing) {
    return {
      success: false,
      message: "Zu diesem Link gibt es schon einen Vorschlag",
    }
  }

  const og = await fetchOgMetadata(url)
  const cleanNotes = notes?.trim() || null
  if (!og.title && !cleanNotes) {
    return {
      success: false,
      message:
        "Die Seite liefert keinen Titel. Bitte kurz beschreiben, worum es geht.",
    }
  }

  const site = og.siteName || new URL(url).hostname.replace(/^www\./, "")
  const content = await generateMeckyPostFromLink({
    title: og.title,
    description: og.description,
    site,
    url,
    notes: cleanNotes,
  })
  if (!content) {
    return { success: false, message: "Mecky konnte keinen Post schreiben" }
  }

  const { data, error } = await supabase
    .from("mecky_drafts")
    .insert({
      content,
      source_url: url,
      source_title: og.title,
      source_site: site,
      source_published_at: null,
      rss_item_guid: url,
      og_title: og.title,
      og_description: og.description,
      og_image: og.image,
      og_site_name: og.siteName,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        message: "Zu diesem Link gibt es schon einen Vorschlag",
      }
    }
    throw error
  }

  return {
    success: true,
    message: "Vorschlag erstellt",
    count: 1,
    drafts: [{ id: data.id, content: data.content, source: data.source_site }],
  }
}
