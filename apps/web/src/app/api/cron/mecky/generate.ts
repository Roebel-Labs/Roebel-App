import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllFeeds, filterRecentItems } from "./rss"
import { generateMeckyPosts } from "./prompt"

export interface GenerateResult {
  success: boolean
  message: string
  count?: number
  drafts?: Array<{ id: string; content: string; source: string | null }>
}

export async function generateMeckyDrafts(options?: {
  skipDedup?: boolean
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

  // Filter for recent items (last 48 hours)
  const recentItems = filterRecentItems(allItems, 48)
  console.log(`${recentItems.length} items from last 48 hours`)

  if (recentItems.length === 0) {
    return {
      success: true,
      message: "No recent news items found",
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
      message: "All recent items already processed",
      count: 0,
    }
  }

  // Generate posts with Claude
  console.log("Generating Mecky posts with Claude...")
  const proposals = await generateMeckyPosts(newItems)
  console.log(`Claude generated ${proposals.length} post proposals`)

  if (proposals.length === 0) {
    return {
      success: true,
      message: "Claude found no relevant news for Röbel/Müritz",
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

    // Try to fetch OG metadata
    let ogTitle: string | null = null
    let ogDescription: string | null = null
    let ogImage: string | null = null
    let ogSiteName: string | null = null

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
      const ogRes = await fetch(
        `${baseUrl}/api/og-metadata?url=${encodeURIComponent(sourceArticle.link)}`
      )
      const ogJson = await ogRes.json()
      if (ogJson.success && ogJson.data) {
        ogTitle = ogJson.data.title
        ogDescription = ogJson.data.description
        ogImage = ogJson.data.image
        ogSiteName = ogJson.data.siteName
      }
    } catch (err) {
      console.warn("OG metadata fetch failed for", sourceArticle.link, err)
    }

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
        og_title: ogTitle,
        og_description: ogDescription,
        og_image: ogImage,
        og_site_name: ogSiteName,
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
    message: `Generated ${insertedDrafts.length} Mecky post proposals`,
    count: insertedDrafts.length,
    drafts: insertedDrafts,
  }
}
