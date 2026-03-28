"use client"

import { Phone, Mail, Globe, MapPin } from "lucide-react"
import type { Business } from "@/types/business"

interface BusinessContactInfoProps {
  business: Business
}

export function BusinessContactInfo({ business }: BusinessContactInfoProps) {
  const hasContact = business.phone || business.email || business.website_url || business.address

  if (!hasContact) return null

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <h3 className="font-semibold text-foreground mb-3">Kontakt</h3>

      <div className="space-y-3">
        {business.phone && (
          <a
            href={`tel:${business.phone}`}
            className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Phone className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span>{business.phone}</span>
          </a>
        )}

        {business.email && (
          <a
            href={`mailto:${business.email}`}
            className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Mail className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span>{business.email}</span>
          </a>
        )}

        {business.website_url && (
          <a
            href={business.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">{business.website_url.replace(/^https?:\/\//, "")}</span>
          </a>
        )}

        {business.address && (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
            <span>{business.address}</span>
          </div>
        )}
      </div>
    </div>
  )
}
