"use client"

import { use, useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  MessageSquare,
  Tag,
  Calendar,
  Eye,
  Store,
  Sparkles,
  Package,
  Megaphone,
} from "lucide-react"
import { getAdWithBusinessById, trackAdView } from "@/app/actions/local-ads"
import type { AdWithBusiness } from "@/app/actions/local-ads"
import type { DealType } from "@/types/business"
import { getDealTypeLabel, getCategoryLabel } from "@/types/business"
import { MediaCarousel } from "@/components/business/MediaCarousel"

const dealTypeColors: Record<DealType, string> = {
  discount: "bg-green-50 text-green-700",
  special: "bg-purple-50 text-purple-700",
  event: "bg-blue-50 text-blue-700",
  new_product: "bg-orange-50 text-orange-700",
  promotion: "bg-pink-50 text-pink-700",
}

const dealTypeIcons: Record<DealType, React.ReactNode> = {
  discount: <Tag className="h-3.5 w-3.5" />,
  special: <Sparkles className="h-3.5 w-3.5" />,
  event: <Calendar className="h-3.5 w-3.5" />,
  new_product: <Package className="h-3.5 w-3.5" />,
  promotion: <Megaphone className="h-3.5 w-3.5" />,
}

export default function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [ad, setAd] = useState<AdWithBusiness | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const result = await getAdWithBusinessById(id)
      if (result.success && result.data) {
        setAd(result.data)
        trackAdView(id)
      } else {
        setError(result.error || "Angebot nicht gefunden")
      }
      setIsLoading(false)
    }
    load()
  }, [id])

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto animate-pulse space-y-4">
        <div className="h-6 bg-muted rounded w-1/4" />
        <div className="h-64 bg-muted rounded-lg" />
        <div className="h-8 bg-muted rounded w-1/2" />
        <div className="h-5 bg-muted rounded w-1/3" />
        <div className="h-20 bg-muted rounded" />
      </div>
    )
  }

  if (error || !ad) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">{error || "Angebot nicht gefunden"}</p>
        <Link
          href="/app/angebote"
          className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Angebote
        </Link>
      </div>
    )
  }

  const dealType = ad.deal_type as DealType
  const mediaImages =
    ad.media_urls && ad.media_urls.length > 0
      ? ad.media_urls
      : ad.image_url
        ? [ad.image_url]
        : []

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Back link */}
      <Link
        href="/app/angebote"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Angebote
      </Link>

      {/* Media */}
      {mediaImages.length > 0 ? (
        <div className="rounded-lg overflow-hidden">
          <MediaCarousel
            images={mediaImages}
            videoUrl={ad.video_url}
            alt={ad.title}
            height="h-64 sm:h-80"
          />
        </div>
      ) : null}

      {/* Main info */}
      <div className="bg-card rounded-lg border border-border p-4">
        {/* Deal type badge */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              dealTypeColors[dealType] || "bg-muted text-foreground"
            }`}
          >
            {dealTypeIcons[dealType]}
            {getDealTypeLabel(dealType)}
          </span>
        </div>

        {/* Title + value */}
        <h1 className="text-xl font-bold text-foreground">{ad.title}</h1>
        {ad.deal_value && (
          <p className="text-lg font-semibold text-green-600 mt-1">{ad.deal_value}</p>
        )}

        {/* Description */}
        {ad.description && (
          <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">{ad.description}</p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          {(ad.start_date || ad.end_date) && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {ad.start_date && formatDate(ad.start_date)}
              {ad.start_date && ad.end_date && " – "}
              {ad.end_date && formatDate(ad.end_date)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {ad.views_count} Aufrufe
          </span>
        </div>
      </div>

      {/* Business card */}
      <div className="bg-card rounded-lg border border-border p-4">
        <p className="text-xs text-muted-foreground mb-3">Anbieter</p>
        <div className="flex items-center gap-3">
          <Link
            href={`/app/gewerbe/${ad.business_slug}`}
            className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex items-center justify-center flex-shrink-0"
          >
            {ad.business_logo_url ? (
              <Image
                src={ad.business_logo_url}
                alt={ad.business_name}
                width={40}
                height={40}
                className="object-cover w-full h-full"
              />
            ) : (
              <Store className="h-5 w-5 text-muted-foreground" />
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/app/gewerbe/${ad.business_slug}`}
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              {ad.business_name}
            </Link>
            <p className="text-xs text-muted-foreground">
              {getCategoryLabel(ad.business_category)}
            </p>
          </div>
        </div>

        {/* Contact CTA */}
        {ad.business_owner_wallet_address && (
          <div className="mt-4">
            <Link
              href={`/app/messages?to=${ad.business_owner_wallet_address}&subject=${encodeURIComponent(ad.title)}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              Nachricht senden
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
