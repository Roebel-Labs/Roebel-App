"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Edit, Tag } from "lucide-react"
import { useActiveAccount } from "thirdweb/react"
import { getBusinessBySlug, getActiveDeals } from "@/app/actions/businesses"
import type { Business, BusinessDeal } from "@/types/business"
import { BusinessDetailHeader } from "@/components/business/BusinessDetailHeader"
import { BusinessOpeningHours } from "@/components/business/BusinessOpeningHours"
import { BusinessContactInfo } from "@/components/business/BusinessContactInfo"
import { BusinessGallery } from "@/components/business/BusinessGallery"
import { BusinessDealsSection } from "@/components/business/BusinessDealsSection"

export default function BusinessDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const account = useActiveAccount()

  const [business, setBusiness] = useState<Business | null>(null)
  const [deals, setDeals] = useState<BusinessDeal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isOwner = account?.address &&
    business?.owner_wallet_address === account.address.toLowerCase()

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const result = await getBusinessBySlug(slug)
      if (result.success && result.data) {
        setBusiness(result.data)
        // Load deals
        const dealsResult = await getActiveDeals(result.data.id)
        if (dealsResult.success && dealsResult.data) {
          setDeals(dealsResult.data)
        }
      } else {
        setError(result.error || "Gewerbe nicht gefunden")
      }
      setIsLoading(false)
    }
    load()
  }, [slug])

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-6 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </div>
    )
  }

  if (error || !business) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground font-medium">{error || "Gewerbe nicht gefunden"}</p>
        <Link
          href="/app/gewerbe"
          className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zum Verzeichnis
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/app/gewerbe"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zum Verzeichnis
      </Link>

      {/* Header */}
      <BusinessDetailHeader business={business} isOwner={!!isOwner} />

      {/* Owner Actions */}
      {isOwner && (
        <div className="flex gap-3">
          <Link
            href="/app/gewerbe/bearbeiten"
            className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Edit className="h-4 w-4" />
            Bearbeiten
          </Link>
          <Link
            href="/app/gewerbe/angebote"
            className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Tag className="h-4 w-4" />
            Angebote verwalten
          </Link>
        </div>
      )}

      {/* Content */}
      <div className="space-y-6">
        <BusinessDealsSection deals={deals} />
        <BusinessOpeningHours hours={business.opening_hours} />
        <BusinessContactInfo business={business} />
        <BusinessGallery
          images={business.gallery_images}
          businessName={business.name}
        />
      </div>
    </div>
  )
}
