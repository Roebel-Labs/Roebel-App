export interface RSSItem {
  title: string
  link: string
  description: string
  pubDate: string
  guid: string
}

// Order matters: the regional feed comes first so shared items keep its label
// and Röbel-area stories lead the list Claude picks from.
const RSS_FEEDS = [
  {
    // Haff-Müritz studio (Neubrandenburg) — covers Röbel and the Seenplatte.
    // Most local stories (sport, clubs, road closures) ONLY appear here, not
    // in the statewide feed below.
    url: "https://www.ndr.de/nachrichten/mecklenburg-vorpommern/haff-mueritz/index-rss.xml",
    site: "NDR Haff-Müritz",
  },
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
  // Regional stories are cross-posted to the statewide feed with the same guid
  const seen = new Set<string>()

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
        const key = item.guid || item.link
        if (seen.has(key)) continue
        seen.add(key)
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

/**
 * Time windows the admin can pick before triggering a manual generation run.
 * "48h" is the default and matches what the daily cron has always done.
 */
export type MeckyTimeWindow = "today" | "yesterday" | "48h" | "7d"

export interface ResolvedTimeWindow {
  /** inclusive lower bound */
  from: Date
  /** exclusive upper bound */
  to: Date
  /** German label, shown in the UI and handed to Claude as context */
  label: string
}

const NEWS_TIME_ZONE = "Europe/Berlin"

/** UTC offset of Europe/Berlin at `at`, in minutes (+60 CET, +120 CEST). */
function berlinOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: NEWS_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value // "GMT+02:00"
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === "-" ? -minutes : minutes
}

/**
 * Midnight in Röbel's time zone, `offsetDays` from today. The server runs in
 * UTC on Vercel, so local-midnight math would put the day boundary at 02:00.
 */
function startOfBerlinDay(offsetDays = 0, now: Date = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: NEWS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number)
  const utcMidnight = Date.UTC(y, m - 1, d + offsetDays)
  return new Date(
    utcMidnight - berlinOffsetMinutes(new Date(utcMidnight)) * 60 * 1000
  )
}

export function resolveTimeWindow(
  window: MeckyTimeWindow = "48h",
  now: Date = new Date()
): ResolvedTimeWindow {
  switch (window) {
    case "today":
      return { from: startOfBerlinDay(0, now), to: now, label: "heute" }
    case "yesterday":
      return {
        from: startOfBerlinDay(-1, now),
        to: startOfBerlinDay(0, now),
        label: "gestern",
      }
    case "7d":
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: now,
        label: "letzte 7 Tage",
      }
    case "48h":
    default:
      return {
        from: new Date(now.getTime() - 48 * 60 * 60 * 1000),
        to: now,
        label: "letzte 48 Stunden",
      }
  }
}

/**
 * Keep only items published inside [from, to).
 *
 * Unlike filterRecentItems(), items without a pubDate are dropped: a bounded
 * window is an explicit request for a specific day, so undated items (NDR
 * ships a few evergreen pages in the feed) would just be noise.
 */
export function filterItemsInWindow(
  items: Array<RSSItem & { site: string }>,
  window: ResolvedTimeWindow
): Array<RSSItem & { site: string }> {
  return items.filter((item) => {
    if (!item.pubDate) return false
    const pubDate = new Date(item.pubDate)
    if (Number.isNaN(pubDate.getTime())) return false
    return pubDate >= window.from && pubDate < window.to
  })
}
