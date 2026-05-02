"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Store, Clock, CheckCircle, XCircle, Plus, MapPin, Phone, Globe, Tag } from "lucide-react"
import { getBusinessesByOwner } from "@/app/actions/businesses"
import type { Business } from "@/types/business"
import { getCategoryLabel } from "@/types/business"

interface BusinessProfileSectionProps {
  walletAddress: string
}

export function BusinessProfileSection({ walletAddress }: BusinessProfileSectionProps) {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadBusinesses() {
      const result = await getBusinessesByOwner(walletAddress)
      if (result.success && result.data) {
        setBusinesses(result.data)
      }
      setIsLoading(false)
    }
    loadBusinesses()
  }, [walletAddress])

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Store className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-sm sm:text-base font-medium text-foreground">Gewerbe-Profil</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
      </div>
    )
  }

  // No businesses yet
  if (businesses.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Store className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-sm sm:text-base font-medium text-foreground">Gewerbe-Profil</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Sie haben noch kein Gewerbe angemeldet. Registrieren Sie Ihr Unternehmen, um es im Gewerbe-Verzeichnis zu listen.
        </p>
        <Link
          href="/app/gewerbe/erstellen"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Gewerbe anmelden
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {businesses.map((business) => (
        <div key={business.id} className="bg-card rounded-lg border border-border overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              {/* Logo */}
              <div className="w-12 h-12 rounded-lg bg-muted border border-border overflow-hidden flex items-center justify-center flex-shrink-0">
                {business.logo_url ? (
                  <Image
                    src={business.logo_url}
                    alt={business.name}
                    width={48}
                    height={48}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <Store className="h-6 w-6 text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-foreground text-sm sm:text-base">{business.name}</h3>
                  {business.status === "published" && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      <CheckCircle className="h-3 w-3" />
                      Aktiv
                    </span>
                  )}
                  {business.status === "pending" && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                      <Clock className="h-3 w-3" />
                      In Prüfung
                    </span>
                  )}
                  {business.status === "rejected" && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                      <XCircle className="h-3 w-3" />
                      Abgelehnt
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{getCategoryLabel(business.category)}</p>

                {/* Description */}
                {business.description && business.status === "published" && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{business.description}</p>
                )}

                {/* Pending message */}
                {business.status === "pending" && (
                  <p className="text-xs text-amber-600 mt-2">
                    Ihr Gewerbe wird derzeit geprüft. Sie werden benachrichtigt, sobald es genehmigt wurde.
                  </p>
                )}
              </div>
            </div>

            {/* Contact info row (approved only) */}
            {business.status === "published" && (business.address || business.phone || business.website_url) && (
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                {business.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate max-w-[150px]">{business.address}</span>
                  </span>
                )}
                {business.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {business.phone}
                  </span>
                )}
                {business.website_url && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate max-w-[120px]">{business.website_url.replace(/^https?:\/\//, "")}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons (approved only) */}
          {business.status === "published" && (
            <div className="flex border-t border-border">
              <Link
                href={`/app/gewerbe/${business.slug}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                <Store className="h-3.5 w-3.5" />
                Gewerbe ansehen
              </Link>
              <div className="w-px bg-muted" />
              <Link
                href="/dashboard/ads"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                <Tag className="h-3.5 w-3.5" />
                Angebote verwalten
              </Link>
              <div className="w-px bg-muted" />
              <Link
                href="/app/gewerbe/bearbeiten"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary hover:bg-blue-50 transition-colors"
              >
                Bearbeiten
              </Link>
            </div>
          )}
        </div>
      ))}

      {/* Add new business link */}
      <Link
        href="/app/gewerbe/erstellen"
        className="flex items-center justify-center gap-2 py-2.5 bg-card border border-dashed border-border hover:border-border text-muted-foreground hover:text-foreground rounded-lg text-xs font-medium transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Weiteres Gewerbe anmelden
      </Link>
    </div>
  )
}
