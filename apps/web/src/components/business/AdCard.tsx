"use client"

import Image from "next/image"
import Link from "next/link"
import { Tag, Sparkles, Calendar, Package, Megaphone, Store, Star } from "lucide-react"
import type { DealType, BusinessCategory } from "@/types/business"
import { getDealTypeLabel, getCategoryLabel } from "@/types/business"
import { trackAdClick } from "@/app/actions/local-ads"
import { MediaCarousel } from "./MediaCarousel"

interface AdCardProps {
  ad: {
    id: string
    title: string
    description: string | null
    deal_type: string
    deal_value: string | null
    start_date: string | null
    end_date: string | null
    image_url: string | null
    media_urls?: string[]
    video_url?: string | null
    is_boosted: boolean
    business_name: string
    business_slug: string
    business_logo_url: string | null
    business_category: BusinessCategory
  }
}

const dealTypeIcons: Record<DealType, React.ReactNode> = {
  discount: <Tag className="h-3.5 w-3.5" />,
  special: <Sparkles className="h-3.5 w-3.5" />,
  event: <Calendar className="h-3.5 w-3.5" />,
  new_product: <Package className="h-3.5 w-3.5" />,
  promotion: <Megaphone className="h-3.5 w-3.5" />,
}

const dealTypeColors: Record<DealType, string> = {
  discount: "bg-green-50 text-green-700",
  special: "bg-purple-50 text-purple-700",
  event: "bg-blue-50 text-blue-700",
  new_product: "bg-orange-50 text-orange-700",
  promotion: "bg-pink-50 text-pink-700",
}

export function AdCard({ ad }: AdCardProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "numeric",
      month: "short",
    })
  }

  const handleClick = () => {
    trackAdClick(ad.id)
  }

  const dealType = ad.deal_type as DealType
  const mediaImages = ad.media_urls && ad.media_urls.length > 0
    ? ad.media_urls
    : ad.image_url ? [ad.image_url] : []

  const boostedBadge = ad.is_boosted ? (
    <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900 z-10">
      <Star className="h-3 w-3" />
      Gesponsert
    </span>
  ) : null

  return (
    <Link
      href={`/app/angebote/${ad.id}`}
      onClick={handleClick}
      className="block bg-card rounded-lg border border-border overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Media */}
      {mediaImages.length > 0 ? (
        <MediaCarousel
          images={mediaImages}
          videoUrl={ad.video_url}
          alt={ad.title}
          height="h-36"
          overlay={boostedBadge}
        />
      ) : ad.is_boosted ? (
        <div className="px-3 pt-3">
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 mb-2">
            <Star className="h-3 w-3" />
            Gesponsert
          </span>
        </div>
      ) : null}

      <div className="p-3">
        {/* Deal type badge */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${dealTypeColors[dealType] || "bg-muted text-foreground"}`}
          >
            {dealTypeIcons[dealType]}
            {getDealTypeLabel(dealType)}
          </span>
        </div>

        {/* Title + value */}
        <h4 className="font-semibold text-foreground text-sm">{ad.title}</h4>
        {ad.deal_value && (
          <p className="text-sm font-medium text-green-600 mt-0.5">{ad.deal_value}</p>
        )}

        {ad.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ad.description}</p>
        )}

        {/* Dates */}
        {(ad.start_date || ad.end_date) && (
          <p className="text-xs text-muted-foreground mt-2">
            {ad.start_date && formatDate(ad.start_date)}
            {ad.start_date && ad.end_date && " – "}
            {ad.end_date && formatDate(ad.end_date)}
          </p>
        )}

        {/* Business info */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
          <div className="w-6 h-6 rounded bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
            {ad.business_logo_url ? (
              <Image
                src={ad.business_logo_url}
                alt={ad.business_name}
                width={24}
                height={24}
                className="object-cover w-full h-full"
              />
            ) : (
              <Store className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{ad.business_name}</p>
            <p className="text-xs text-muted-foreground">{getCategoryLabel(ad.business_category)}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}
