"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ShoppingBag } from "lucide-react"
import { useActiveAccount } from "thirdweb/react"
import { getListingById, updateListing } from "@/app/actions/marketplace"
import type {
  ListingWithSeller,
  MarketplaceCategory,
  ServiceCategory,
  BoardCategory,
  ListingCondition,
  PriceType,
  ServicePriceType,
  BoardPriceType,
} from "@/types/marketplace"
import { isService, isBoard } from "@/types/marketplace"
import { ListingForm } from "@/components/marketplace/ListingForm"

export default function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const account = useActiveAccount()
  const [listing, setListing] = useState<ListingWithSeller | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const result = await getListingById(id)
      if (result.success && result.data) {
        setListing(result.data)
      } else {
        setError(result.error || "Inserat nicht gefunden")
      }
      setIsLoading(false)
    }
    load()
  }, [id])

  const isOwner =
    account?.address &&
    listing?.seller_wallet_address &&
    account.address.toLowerCase() === listing.seller_wallet_address.toLowerCase()

  const handleSubmit = async (data: {
    title: string
    description: string
    price: number
    price_type: PriceType | ServicePriceType | BoardPriceType
    category: MarketplaceCategory | ServiceCategory | BoardCategory
    condition: ListingCondition | null
    neighborhood: string
    media_urls: string[]
  }) => {
    if (!listing || !account?.address) return
    setIsSubmitting(true)

    const result = await updateListing(
      {
        id: listing.id,
        title: data.title,
        description: data.description || undefined,
        price: data.price,
        price_type: data.price_type,
        category: data.category,
        condition: data.condition,
        neighborhood: data.neighborhood || undefined,
        media_urls: data.media_urls,
      },
      account.address
    )

    if (result.success) {
      router.push(`/app/marktplatz/${listing.id}`)
    }
    setIsSubmitting(false)
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
      <div className="animate-pulse space-y-4 max-w-xl mx-auto">
        <div className="h-6 bg-muted rounded w-1/4" />
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  if (error || !listing) {
    return (
      <div className="text-center py-12 max-w-xl mx-auto">
        <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">{error || "Fehler beim Laden"}</p>
        <Link
          href="/app/marktplatz"
          className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Zum Marktplatz
        </Link>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="text-center py-12 max-w-xl mx-auto">
        <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Kein Zugriff auf dieses Inserat</p>
        <Link
          href="/app/marktplatz"
          className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Zum Marktplatz
        </Link>
      </div>
    )
  }

  const isServiceListing = isService(listing)
  const isBoardListing = isBoard(listing)

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div>
        <Link
          href={`/app/marktplatz/${listing.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zum Inserat
        </Link>
        <h1 className="text-xl font-bold text-foreground">
          {isBoardListing
            ? "Aushang bearbeiten"
            : isServiceListing
              ? "Dienstleistung bearbeiten"
              : "Inserat bearbeiten"}
        </h1>
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <ListingForm
          listingType={listing.listing_type}
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/app/marktplatz/${listing.id}`)}
          initialData={{
            title: listing.title,
            description: listing.description || undefined,
            price: listing.price,
            price_type: listing.price_type,
            category: listing.category,
            condition: listing.condition,
            neighborhood: listing.neighborhood || undefined,
            media_urls: listing.media_urls,
          }}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  )
}
