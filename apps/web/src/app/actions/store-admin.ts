"use server"

import { createAdminClient } from "@/lib/supabase/admin"

export interface StoreDailyPoint {
  date: string // YYYY-MM-DD
  ios: number
  android: number
}

export interface StoreMetrics {
  totals: { ios: number; android: number; combined: number }
  daily: StoreDailyPoint[]
  hasData: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

function lastNDays(days: number): string[] {
  const out: string[] = []
  const today = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(today - i * DAY_MS).toISOString().slice(0, 10))
  }
  return out
}

/**
 * Read store download metrics from `store_metrics` (service role).
 * Totals use the running cumulative_total when present (Google), otherwise the
 * sum of collected daily downloads (Apple — "seit Tracking-Start").
 */
export async function getStoreMetrics(): Promise<{
  success: boolean
  data?: StoreMetrics
  error?: string
}> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("store_metrics")
      .select("platform, date, downloads, cumulative_total")
      .order("date", { ascending: true })

    if (error) return { success: false, error: error.message }

    const rows = (data ?? []) as {
      platform: "ios" | "android"
      date: string
      downloads: number
      cumulative_total: number | null
    }[]

    // Daily series over last 60 days, zero-filled.
    const byDate = new Map<string, { ios: number; android: number }>()
    for (const r of rows) {
      const e = byDate.get(r.date) ?? { ios: 0, android: 0 }
      e[r.platform] = (e[r.platform] ?? 0) + (r.downloads ?? 0)
      byDate.set(r.date, e)
    }
    const daily: StoreDailyPoint[] = lastNDays(60).map((date) => ({
      date,
      ios: byDate.get(date)?.ios ?? 0,
      android: byDate.get(date)?.android ?? 0,
    }))

    // Totals: prefer max(cumulative_total) per platform; fall back to sum of downloads.
    const totalFor = (platform: "ios" | "android"): number => {
      const pr = rows.filter((r) => r.platform === platform)
      const cumulatives = pr
        .map((r) => r.cumulative_total)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      if (cumulatives.length > 0) return Math.max(...cumulatives)
      return pr.reduce((sum, r) => sum + (r.downloads ?? 0), 0)
    }

    const ios = totalFor("ios")
    const android = totalFor("android")

    return {
      success: true,
      data: {
        totals: { ios, android, combined: ios + android },
        daily,
        hasData: rows.length > 0,
      },
    }
  } catch (error) {
    console.error("[store-admin] Failed to load store metrics:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
