"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  Plus,
  ShoppingBag,
  Pencil,
  Trash2,
  CheckCircle,
  RotateCcw,
  Pause,
  Eye,
} from "lucide-react"
import { useActiveAccount } from "thirdweb/react"
import {
  getListingsBySeller,
  deleteListing,
  updateListingStatus,
} from "@/app/actions/marketplace"
import type { MarketplaceListing, ListingStatus } from "@/types/marketplace"
import {
  formatListingPrice,
  getConditionLabel,
  getAnyCategoryLabel,
  isService,
  isBoard,
} from "@/types/marketplace"

const statusConfig: Record<string, { bg: string; label: string }> = {
  active: { bg: "bg-green-100 text-green-700", label: "Aktiv" },
  sold: { bg: "bg-muted text-muted-foreground", label: "Verkauft" },
  reserved: { bg: "bg-amber-100 text-amber-700", label: "Reserviert" },
  paused: { bg: "bg-gray-100 text-gray-600", label: "Pausiert" },
}

export default function MyListingsPage() {
  const account = useActiveAccount()
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!account?.address) return
      setIsLoading(true)
      const result = await getListingsBySeller(account.address)
      if (result.success && result.data) {
        setListings(result.data)
      }
      setIsLoading(false)
    }
    load()
  }, [account?.address])

  const handleStatusChange = async (id: string, status: ListingStatus) => {
    if (!account?.address) return
    const result = await updateListingStatus(id, account.address, status)
    if (result.success && result.data) {
      setListings(listings.map((l) => (l.id === id ? { ...l, status: result.data!.status } : l)))
    }
  }

  const handleDelete = async (id: string) => {
    if (!account?.address) return
    const result = await deleteListing(id, account.address)
    if (result.success) {
      setListings(listings.filter((l) => l.id !== id))
    }
  }

  if (!account?.address) {
    return (
      <div className="text-center py-12">
        <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Wallet nicht verbunden</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 max-w-3xl">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-20 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/app/marktplatz"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Marktplatz
          </Link>
          <h1 className="text-xl font-bold text-foreground">Meine Inserate, Dienstleistungen & Aushänge</h1>
        </div>
        <Link
          href="/app/marktplatz/erstellen"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Neu erstellen
        </Link>
      </div>

      {/* Listings */}
      {listings.length > 0 ? (
        <div className="space-y-3">
          {listings.map((listing) => {
            const firstImage = listing.media_urls?.[0]
            const status = statusConfig[listing.status]
            const isServiceListing = isService(listing)
            const isBoardListing = isBoard(listing)

            return (
              <div
                key={listing.id}
                className={`bg-card rounded-xl border p-4 transition-opacity ${
                  listing.status !== "active" ? "border-border opacity-70" : "border-border"
                }`}
              >
                <div className="flex gap-3">
                  {/* Thumbnail */}
                  {firstImage && (
                    <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden flex-shrink-0 relative">
                      <Image src={firstImage} alt={listing.title} fill className="object-cover" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-foreground text-sm truncate">{listing.title}</h3>
                      {status && (
                        <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          isBoardListing && listing.status === "sold" ? "bg-green-100 text-green-700" : status.bg
                        }`}>
                          {isBoardListing && listing.status === "sold" ? "Erledigt" : status.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {formatListingPrice(listing.price, listing.price_type, listing.listing_type)}
                      </span>
                      <span>{getAnyCategoryLabel(listing.category)}</span>
                      {!isServiceListing && listing.condition && (
                        <span>{getConditionLabel(listing.condition)}</span>
                      )}
                      {isServiceListing && (
                        <span className="text-purple-600">Dienstleistung</span>
                      )}
                      {isBoardListing && (
                        <span className="text-amber-600">Schwarzes Brett</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {listing.views_count || 0}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-start gap-0.5 flex-shrink-0">
                    <Link
                      href={`/app/marktplatz/${listing.id}/bearbeiten`}
                      className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                      title="Bearbeiten"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    {isBoardListing ? (
                      <>
                        {listing.status === "active" && (
                          <button
                            onClick={() => handleStatusChange(listing.id, "sold")}
                            className="p-1.5 text-muted-foreground hover:text-green-600 transition-colors"
                            title="Als erledigt markieren"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        {(listing.status === "sold" || listing.status === "paused") && (
                          <button
                            onClick={() => handleStatusChange(listing.id, "active")}
                            className="p-1.5 text-muted-foreground hover:text-green-600 transition-colors"
                            title="Wieder aktivieren"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    ) : isServiceListing ? (
                      <>
                        {listing.status === "active" && (
                          <button
                            onClick={() => handleStatusChange(listing.id, "paused")}
                            className="p-1.5 text-muted-foreground hover:text-gray-600 transition-colors"
                            title="Pausieren"
                          >
                            <Pause className="h-4 w-4" />
                          </button>
                        )}
                        {listing.status === "paused" && (
                          <button
                            onClick={() => handleStatusChange(listing.id, "active")}
                            className="p-1.5 text-muted-foreground hover:text-green-600 transition-colors"
                            title="Aktivieren"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {listing.status === "active" && (
                          <button
                            onClick={() => handleStatusChange(listing.id, "sold")}
                            className="p-1.5 text-muted-foreground hover:text-green-600 transition-colors"
                            title="Als verkauft markieren"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        {(listing.status === "sold" || listing.status === "reserved") && (
                          <button
                            onClick={() => handleStatusChange(listing.id, "active")}
                            className="p-1.5 text-muted-foreground hover:text-green-600 transition-colors"
                            title="Wieder aktivieren"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(listing.id)}
                      className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8 bg-card rounded-xl border border-border">
          <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground font-medium">Noch keine Inserate, Dienstleistungen oder Aushänge erstellt</p>
          <p className="text-sm text-muted-foreground mt-1">
            Erstellen Sie ein Inserat, bieten Sie eine Dienstleistung an oder hängen Sie etwas ans Schwarze Brett.
          </p>
        </div>
      )}
    </div>
  )
}
