"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { globalSearch } from "@/app/actions/global-search"
import { SearchResultRow } from "./SearchResultRow"
import { SEARCH_CATEGORIES } from "@/types/search"
import type { SearchResults, SearchResultItem } from "@/types/search"

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [results, setResults] = useState<SearchResults>({})
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Execute search
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults({})
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    globalSearch(debouncedQuery).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setResults(res.data)
      } else {
        setResults({})
      }
      setIsLoading(false)
      setActiveIndex(0)
    })

    return () => { cancelled = true }
  }, [debouncedQuery])

  // Reset when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery("")
      setDebouncedQuery("")
      setResults({})
      setActiveIndex(0)
      // Focus input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Flatten results for keyboard navigation
  const flatItems = useMemo(() => {
    const items: SearchResultItem[] = []
    for (const cat of SEARCH_CATEGORIES) {
      const catResults = results[cat.key]
      if (catResults && catResults.length > 0) {
        items.push(...catResults)
      }
    }
    return items
  }, [results])

  const totalResults = flatItems.length

  const navigateToResult = useCallback(
    (item: SearchResultItem) => {
      onOpenChange(false)
      router.push(item.href)
    },
    [onOpenChange, router]
  )

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % Math.max(totalResults, 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((prev) => (prev - 1 + Math.max(totalResults, 1)) % Math.max(totalResults, 1))
      } else if (e.key === "Enter" && flatItems[activeIndex]) {
        e.preventDefault()
        navigateToResult(flatItems[activeIndex])
      }
    },
    [totalResults, flatItems, activeIndex, navigateToResult]
  )

  const hasQuery = query.trim().length >= 2
  const hasResults = totalResults > 0
  const showEmpty = hasQuery && !isLoading && !hasResults

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden top-[15%] translate-y-0 sm:top-[15%] sm:translate-y-0">
        <DialogTitle className="sr-only">Suche</DialogTitle>

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin flex-shrink-0" />
          ) : (
            <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Suche nach Events, News, Gewerbe, Marktplatz..."
            className="flex-1 py-4 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground text-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border">
              ESC
            </kbd>
          )}
        </div>

        {/* Results area */}
        <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
          {/* Loading skeletons */}
          {isLoading && !hasResults && (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="h-10 w-10 rounded-lg bg-muted animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-muted rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results grouped by category */}
          {hasResults && (
            <div className="py-2">
              {(() => {
                let globalIdx = 0
                return SEARCH_CATEGORIES.map((cat) => {
                  const catResults = results[cat.key]
                  if (!catResults || catResults.length === 0) return null

                  const section = (
                    <div key={cat.key}>
                      <div className="px-4 py-1.5">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {cat.label}
                        </span>
                      </div>
                      <div className="px-2">
                        {catResults.map((item) => {
                          const idx = globalIdx++
                          return (
                            <SearchResultRow
                              key={`${item.type}-${item.id}`}
                              item={item}
                              isActive={idx === activeIndex}
                              onClick={() => navigateToResult(item)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                  return section
                })
              })()}
            </div>
          )}

          {/* No results */}
          {showEmpty && (
            <div className="px-4 py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Keine Ergebnisse für &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Versuchen Sie einen anderen Suchbegriff.
              </p>
            </div>
          )}

          {/* Initial empty state */}
          {!hasQuery && !isLoading && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Suche nach Events, News, Gewerbe, Marktplatz und mehr...
              </p>
            </div>
          )}
        </div>

        {/* Footer with shortcut hints */}
        {hasResults && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded border border-border font-mono text-[10px]">&uarr;</kbd>
              <kbd className="px-1 py-0.5 bg-muted rounded border border-border font-mono text-[10px]">&darr;</kbd>
              Navigieren
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border font-mono text-[10px]">&crarr;</kbd>
              Öffnen
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded border border-border font-mono text-[10px]">ESC</kbd>
              Schließen
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
