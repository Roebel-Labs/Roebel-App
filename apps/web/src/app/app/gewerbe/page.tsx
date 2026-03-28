"use client"

import { useState, useEffect } from "react"
import { Store } from "lucide-react"
import { getApprovedBusinesses } from "@/app/actions/businesses"
import type { Business, BusinessCategory } from "@/types/business"
import { BusinessCard } from "@/components/business/BusinessCard"
import { BusinessDirectoryFilters } from "@/components/business/BusinessDirectoryFilters"

export default function GewerbePage() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<BusinessCategory | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    async function loadBusinesses() {
      setIsLoading(true)
      const result = await getApprovedBusinesses(
        selectedCategory || undefined,
        searchQuery || undefined
      )
      if (result.success && result.data) {
        setBusinesses(result.data)
      }
      setIsLoading(false)
    }
    loadBusinesses()
  }, [selectedCategory, searchQuery])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="h-6 w-6" />
          Gewerbe-Verzeichnis
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Entdecken Sie lokale Unternehmen in Röbel/Müritz
        </p>
      </div>

      {/* Filters */}
      <BusinessDirectoryFilters
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card rounded-xl border border-border overflow-hidden animate-pulse">
              <div className="h-32 bg-muted" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : businesses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {businesses.map((business) => (
            <BusinessCard key={business.id} business={business} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Keine Gewerbe gefunden</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery || selectedCategory
              ? "Versuchen Sie eine andere Suche oder Kategorie."
              : "Es sind noch keine Gewerbe registriert."}
          </p>
        </div>
      )}
    </div>
  )
}
