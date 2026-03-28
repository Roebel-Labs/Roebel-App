"use client"

import { useState } from "react"
import { Eye, MousePointerClick, TrendingUp, BarChart3 } from "lucide-react"
import type { BusinessDeal } from "@/types/business"
import { AdStatusBadge } from "./AdStatusBadge"

interface AdAnalyticsDashboardProps {
  deals: BusinessDeal[]
}

type SortKey = "newest" | "views" | "clicks" | "ctr"

export function AdAnalyticsDashboard({ deals }: AdAnalyticsDashboardProps) {
  const [sortBy, setSortBy] = useState<SortKey>("views")

  const totalViews = deals.reduce((sum, d) => sum + (d.views_count || 0), 0)
  const totalClicks = deals.reduce((sum, d) => sum + (d.clicks_count || 0), 0)
  const avgCtr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : "0.0"
  const activeCount = deals.filter((d) => d.status === "active").length

  const sortedDeals = [...deals].sort((a, b) => {
    switch (sortBy) {
      case "views":
        return (b.views_count || 0) - (a.views_count || 0)
      case "clicks":
        return (b.clicks_count || 0) - (a.clicks_count || 0)
      case "ctr": {
        const ctrA = a.views_count ? (a.clicks_count || 0) / a.views_count : 0
        const ctrB = b.views_count ? (b.clicks_count || 0) / b.views_count : 0
        return ctrB - ctrA
      }
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
  })

  const maxViews = Math.max(...deals.map((d) => d.views_count || 0), 1)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs">Aufrufe</span>
          </div>
          <p className="text-xl font-bold text-foreground">{totalViews.toLocaleString("de-DE")}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <MousePointerClick className="h-3.5 w-3.5" />
            <span className="text-xs">Klicks</span>
          </div>
          <p className="text-xl font-bold text-foreground">{totalClicks.toLocaleString("de-DE")}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs">Durchschn. CTR</span>
          </div>
          <p className="text-xl font-bold text-foreground">{avgCtr}%</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="text-xs">Aktive Anzeigen</span>
          </div>
          <p className="text-xl font-bold text-foreground">{activeCount}</p>
        </div>
      </div>

      {/* Sort control */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Leistung pro Anzeige</h3>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="text-xs border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="views">Meiste Aufrufe</option>
          <option value="clicks">Meiste Klicks</option>
          <option value="ctr">Beste CTR</option>
          <option value="newest">Neueste</option>
        </select>
      </div>

      {/* Per-deal stats */}
      {sortedDeals.length > 0 ? (
        <div className="space-y-2">
          {sortedDeals.map((deal) => {
            const ctr = deal.views_count
              ? ((deal.clicks_count || 0) / deal.views_count * 100).toFixed(1)
              : "0.0"
            const barWidth = maxViews > 0 ? ((deal.views_count || 0) / maxViews) * 100 : 0

            return (
              <div key={deal.id} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <h4 className="text-sm font-medium text-foreground truncate">{deal.title}</h4>
                    <AdStatusBadge status={deal.status} />
                  </div>
                </div>

                {/* Bar visualization */}
                <div className="h-2 bg-muted rounded-full mb-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {(deal.views_count || 0).toLocaleString("de-DE")} Aufrufe
                  </span>
                  <span className="flex items-center gap-1">
                    <MousePointerClick className="h-3 w-3" />
                    {(deal.clicks_count || 0).toLocaleString("de-DE")} Klicks
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {ctr}% CTR
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Noch keine Anzeigen-Daten vorhanden.
        </div>
      )}
    </div>
  )
}
