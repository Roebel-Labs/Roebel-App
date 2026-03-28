"use client"

import { Tag, Sparkles, Calendar, Package, Megaphone } from "lucide-react"
import type { BusinessDeal, DealType } from "@/types/business"
import { getDealTypeLabel } from "@/types/business"
import { MediaCarousel } from "./MediaCarousel"

interface DealCardProps {
  deal: BusinessDeal
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

export function DealCard({ deal }: DealCardProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "numeric",
      month: "short",
    })
  }

  const mediaImages = deal.media_urls && deal.media_urls.length > 0
    ? deal.media_urls
    : deal.image_url ? [deal.image_url] : []

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {mediaImages.length > 0 && (
        <MediaCarousel
          images={mediaImages}
          videoUrl={deal.video_url}
          alt={deal.title}
          height="h-32"
        />
      )}

      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${dealTypeColors[deal.deal_type]}`}>
            {dealTypeIcons[deal.deal_type]}
            {getDealTypeLabel(deal.deal_type)}
          </span>
        </div>

        <h4 className="font-semibold text-foreground text-sm">{deal.title}</h4>

        {deal.deal_value && (
          <p className="text-sm font-medium text-green-600 mt-1">{deal.deal_value}</p>
        )}

        {deal.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{deal.description}</p>
        )}

        {(deal.start_date || deal.end_date) && (
          <p className="text-xs text-muted-foreground mt-2">
            {deal.start_date && formatDate(deal.start_date)}
            {deal.start_date && deal.end_date && " – "}
            {deal.end_date && formatDate(deal.end_date)}
          </p>
        )}
      </div>
    </div>
  )
}
