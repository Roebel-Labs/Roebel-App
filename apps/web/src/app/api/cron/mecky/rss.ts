export interface RSSItem {
  title: string
  link: string
  description: string
  pubDate: string
  guid: string
}

const RSS_FEEDS = [
  {
    url: "https://www.ndr.de/nachrichten/mecklenburg-vorpommern/index-rss.xml",
    site: "NDR MV",
  },
]

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim()
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA sections
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  )
  const cdataMatch = xml.match(cdataRegex)
  if (cdataMatch) return cdataMatch[1].trim()

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")
  const match = xml.match(regex)
  return match ? match[1].trim() : ""
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = []
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    const title = stripHtml(extractTag(itemXml, "title"))
    const link = extractTag(itemXml, "link")
    const description = stripHtml(extractTag(itemXml, "description"))
    const pubDate = extractTag(itemXml, "pubDate")
    const guid = extractTag(itemXml, "guid") || link

    if (title && link) {
      items.push({ title, link, description, pubDate, guid })
    }
  }

  return items
}

export async function fetchAllFeeds(): Promise<
  Array<RSSItem & { site: string }>
> {
  const allItems: Array<RSSItem & { site: string }> = []

  for (const feed of RSS_FEEDS) {
    try {
      const response = await fetch(feed.url, {
        headers: { "User-Agent": "RoebelApp-MeckyBot/1.0" },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        console.warn(`RSS fetch failed for ${feed.site}: ${response.status}`)
        continue
      }

      const xml = await response.text()
      const items = parseRSSItems(xml)

      for (const item of items) {
        allItems.push({ ...item, site: feed.site })
      }
    } catch (error) {
      console.warn(`RSS fetch error for ${feed.site}:`, error)
    }
  }

  return allItems
}

export function filterRecentItems(
  items: Array<RSSItem & { site: string }>,
  hoursBack = 48
): Array<RSSItem & { site: string }> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  return items.filter((item) => {
    if (!item.pubDate) return true // include items without a date
    const pubDate = new Date(item.pubDate)
    return pubDate >= cutoff
  })
}
