"use client"

import { useState, useEffect } from "react"
import { Tag, Search } from "lucide-react"
import { getAllActiveAds } from "@/app/actions/local-ads"
import type { AdWithBusiness } from "@/app/actions/local-ads"
import type { BusinessCategory } from "@/types/business"
import { BUSINESS_CATEGORIES } from "@/types/business"
import { AdCard } from "@/components/business/AdCard"

export default function LokaleAngebotePage() {
  const [ads, setAds] = useState<AdWithBusiness[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<BusinessCategory | "">("")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const result = await getAllActiveAds(
        categoryFilter || undefined,
        debouncedSearch || undefined
      )
      if (result.success && result.data) {
        setAds(result.data)
      }
      setIsLoading(false)
    }
    load()
  }, [categoryFilter, debouncedSearch])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Tag className="h-6 w-6" />
          Lokale Angebote
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aktuelle Angebote und Aktionen von lokalen Gewerben in Röbel/Müritz.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Angebote durchsuchen..."
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      {/* Category filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setCategoryFilter("")}
          className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
            categoryFilter === ""
              ? "bg-black text-white"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Alle
        </button>
        {BUSINESS_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategoryFilter(cat.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              categoryFilter === cat.value
                ? "bg-black text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Ads Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card rounded-lg border border-border overflow-hidden animate-pulse">
              <div className="h-36 bg-muted" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : ads.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Keine Angebote gefunden</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery || categoryFilter
              ? "Versuchen Sie andere Suchbegriffe oder Filter."
              : "Es gibt derzeit keine aktiven Angebote."}
          </p>
        </div>
      )}
    </div>
  )
}
