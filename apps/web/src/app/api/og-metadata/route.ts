import { NextRequest, NextResponse } from "next/server"
import type { OGMetadata } from "@/types/post"

export const runtime = "nodejs"

// Simple in-memory cache (15 min TTL)
const cache = new Map<string, { data: OGMetadata; timestamp: number }>()
const CACHE_TTL = 15 * 60 * 1000

function getCached(url: string): OGMetadata | null {
  const entry = cache.get(url)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data
  }
  cache.delete(url)
  return null
}

function getMetaContent(html: string, property: string): string | null {
  // Match both property="og:..." and name="og:..." patterns
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']${property}["']`, "i"),
  ]
  for (const regex of patterns) {
    const match = html.match(regex)
    if (match?.[1]) return match[1]
  }
  return null
}

function getTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match?.[1]?.trim() || null
}

function getMetaDescription(html: string): string | null {
  const patterns = [
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
    /<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']description["']/i,
  ]
  for (const regex of patterns) {
    const match = html.match(regex)
    if (match?.[1]) return match[1]
  }
  return null
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

async function fetchOGMetadata(url: string): Promise<OGMetadata> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RoebelApp/1.0; +https://roebel.app)",
        Accept: "text/html",
      },
      redirect: "follow",
    })

    if (!response.ok) {
      return { url, title: null, description: null, image: null, siteName: getDomain(url) }
    }

    const html = await response.text()

    const metadata: OGMetadata = {
      url,
      title: getMetaContent(html, "og:title") || getTitleTag(html),
      description: getMetaContent(html, "og:description") || getMetaDescription(html),
      image: getMetaContent(html, "og:image"),
      siteName: getMetaContent(html, "og:site_name") || getDomain(url),
    }

    // Resolve relative image URLs
    if (metadata.image && !metadata.image.startsWith("http")) {
      try {
        metadata.image = new URL(metadata.image, url).href
      } catch {
        metadata.image = null
      }
    }

    return metadata
  } catch {
    return { url, title: null, description: null, image: null, siteName: getDomain(url) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")

  if (!url) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 }
    )
  }

  // Basic URL validation
  try {
    new URL(url)
  } catch {
    return NextResponse.json(
      { error: "Invalid URL" },
      { status: 400 }
    )
  }

  // Check cache
  const cached = getCached(url)
  if (cached) {
    return NextResponse.json({ success: true, data: cached })
  }

  const metadata = await fetchOGMetadata(url)

  // Cache result
  cache.set(url, { data: metadata, timestamp: Date.now() })

  return NextResponse.json({ success: true, data: metadata })
}
