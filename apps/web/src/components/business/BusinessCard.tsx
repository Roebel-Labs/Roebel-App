"use client"

import Link from "next/link"
import Image from "next/image"
import { MapPin, Store } from "lucide-react"
import type { Business } from "@/types/business"
import { getCategoryLabel } from "@/types/business"

interface BusinessCardProps {
  business: Business
}

export function BusinessCard({ business }: BusinessCardProps) {
  return (
    <Link
      href={`/app/gewerbe/${business.slug}`}
      className="block bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Cover Image */}
      <div className="relative h-32 overflow-hidden">
        {business.cover_image_url ? (
          <>
            <Image
              src={business.cover_image_url}
              alt=""
              fill
              className="object-cover blur-xl scale-110"
              aria-hidden="true"
            />
            <Image
              src={business.cover_image_url}
              alt={business.name}
              fill
              className="object-contain relative z-10"
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Store className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        {business.is_featured && (
          <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-xs font-semibold px-2 py-0.5 rounded-full">
            Empfohlen
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Logo */}
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted border border-border overflow-hidden flex items-center justify-center">
            {business.logo_url ? (
              <Image
                src={business.logo_url}
                alt={`${business.name} Logo`}
                width={48}
                height={48}
                className="object-cover w-full h-full"
              />
            ) : (
              <Store className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{business.name}</h3>
            <span className="inline-block mt-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
              {getCategoryLabel(business.category)}
            </span>
          </div>
        </div>

        {business.address && (
          <div className="flex items-center gap-1.5 mt-3 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{business.address}</span>
          </div>
        )}

        {business.description && (
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {business.description}
          </p>
        )}
      </div>
    </Link>
  )
}
