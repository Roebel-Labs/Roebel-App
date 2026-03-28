"use client"

import Image from "next/image"
import Link from "next/link"
import { MapPin, User } from "lucide-react"
import type { ListingWithSeller } from "@/types/marketplace"
import { formatListingPrice, getConditionLabel, getAnyCategoryLabel, isService, isBoard } from "@/types/marketplace"
import { formatWalletAddress } from "@/lib/user-types"
import { trackListingView } from "@/app/actions/marketplace"
import { MediaCarousel } from "@/components/business/MediaCarousel"

interface ListingCardProps {
  listing: ListingWithSeller
}

const conditionColors: Record<string, string> = {
  neu: "bg-green-50 text-green-700",
  wie_neu: "bg-blue-50 text-blue-700",
  gut: "bg-muted text-foreground",
  akzeptabel: "bg-amber-50 text-amber-700",
}

export function ListingCard({ listing }: ListingCardProps) {
  const handleClick = () => {
    trackListingView(listing.id)
  }

  const statusOverlay =
    listing.status === "sold" ? (
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
        <span className="text-white font-semibold text-sm bg-black/60 px-3 py-1 rounded-full">
          Verkauft
        </span>
      </div>
    ) : listing.status === "reserved" ? (
      <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
        <span className="text-white font-semibold text-sm bg-amber-600/80 px-3 py-1 rounded-full">
          Reserviert
        </span>
      </div>
    ) : listing.status === "paused" ? (
      <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
        <span className="text-white font-semibold text-sm bg-gray-600/80 px-3 py-1 rounded-full">
          Pausiert
        </span>
      </div>
    ) : null

  return (
    <Link
      href={`/app/marktplatz/${listing.id}`}
      onClick={handleClick}
      className="block bg-card rounded-lg border border-border overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Media */}
      {listing.media_urls.length > 0 ? (
        <MediaCarousel
          images={listing.media_urls}
          alt={listing.title}
          height="h-40"
          overlay={statusOverlay}
        />
      ) : (
        <div className="relative h-40 bg-muted flex items-center justify-center">
          <div className="text-muted-foreground">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          {statusOverlay}
        </div>
      )}

      <div className="p-3">
        {/* Badge: condition for products, category for services/board */}
        {isBoard(listing) ? (
          <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full mb-1.5 bg-amber-50 text-amber-700">
            {getAnyCategoryLabel(listing.category)}
          </span>
        ) : isService(listing) ? (
          <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full mb-1.5 bg-purple-50 text-purple-700">
            {getAnyCategoryLabel(listing.category)}
          </span>
        ) : listing.condition ? (
          <span
            className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full mb-1.5 ${
              conditionColors[listing.condition] || "bg-muted text-foreground"
            }`}
          >
            {getConditionLabel(listing.condition)}
          </span>
        ) : null}

        {/* Title */}
        <h4 className="font-semibold text-foreground text-sm truncate">{listing.title}</h4>

        {/* Price */}
        <p className="text-base font-bold text-foreground mt-0.5">
          {formatListingPrice(listing.price, listing.price_type, listing.listing_type)}
        </p>

        {/* Seller info */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          <div className="w-5 h-5 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
            {listing.seller_profile_picture_url ? (
              <Image
                src={listing.seller_profile_picture_url}
                alt={listing.seller_username || formatWalletAddress(listing.seller_wallet_address)}
                width={20}
                height={20}
                className="object-cover w-full h-full"
              />
            ) : (
              <User className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate">
            {listing.seller_username || formatWalletAddress(listing.seller_wallet_address)}
          </span>
          {(listing.neighborhood || listing.seller_neighborhood) && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground ml-auto">
              <MapPin className="h-3 w-3" />
              {listing.neighborhood || listing.seller_neighborhood}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
