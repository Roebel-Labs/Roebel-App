"use client"

import { Search } from "lucide-react"
import type { BusinessCategory } from "@/types/business"
import { BUSINESS_CATEGORIES } from "@/types/business"

interface BusinessDirectoryFiltersProps {
  selectedCategory: BusinessCategory | null
  onCategoryChange: (category: BusinessCategory | null) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}

export function BusinessDirectoryFilters({
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
}: BusinessDirectoryFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Gewerbe suchen..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === null
              ? "bg-foreground text-white"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Alle
        </button>
        {BUSINESS_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => onCategoryChange(cat.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === cat.value
                ? "bg-foreground text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  )
}
