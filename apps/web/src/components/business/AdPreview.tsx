"use client"

import { Eye } from "lucide-react"
import type { DealType, DealStatus, BusinessCategory } from "@/types/business"
import { AdCard } from "./AdCard"

interface AdPreviewProps {
  dealData: {
    title: string
    description: string
    deal_type: DealType
    deal_value: string
    start_date: string
    end_date: string
    media_urls: string[]
    video_url: string | null
    status: DealStatus
  }
  businessName: string
  businessSlug: string
  businessLogoUrl: string | null
  businessCategory: BusinessCategory
}

export function AdPreview({
  dealData,
  businessName,
  businessSlug,
  businessLogoUrl,
  businessCategory,
}: AdPreviewProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Vorschau</span>
      </div>
      <div className="pointer-events-none">
        <AdCard
          ad={{
            id: "preview",
            title: dealData.title || "Titel des Angebots",
            description: dealData.description || null,
            deal_type: dealData.deal_type,
            deal_value: dealData.deal_value || null,
            start_date: dealData.start_date || null,
            end_date: dealData.end_date || null,
            image_url: dealData.media_urls[0] || null,
            media_urls: dealData.media_urls,
            video_url: dealData.video_url,
            is_boosted: false,
            business_name: businessName,
            business_slug: businessSlug,
            business_logo_url: businessLogoUrl,
            business_category: businessCategory,
          }}
        />
      </div>
    </div>
  )
}
