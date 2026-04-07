"use client"

import Image from "next/image"
import { Store, CheckCircle, Clock, XCircle } from "lucide-react"
import type { Business } from "@/types/business"
import { getCategoryLabel } from "@/types/business"

interface BusinessDetailHeaderProps {
  business: Business
  isOwner?: boolean
}

export function BusinessDetailHeader({ business, isOwner }: BusinessDetailHeaderProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Cover Image */}
      <div className="relative h-48 md:h-64 bg-gradient-to-br from-gray-100 to-gray-200">
        {business.cover_image_url && (
          <Image
            src={business.cover_image_url}
            alt={business.name}
            fill
            className="object-cover"
          />
        )}
      </div>

      {/* Business Info */}
      <div className="px-4 sm:px-6 pb-4 sm:pb-5">
        {/* Logo overlapping cover */}
        <div className="-mt-10 sm:-mt-12 mb-3">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-4 border-white bg-card shadow-sm overflow-hidden flex items-center justify-center">
            {business.logo_url ? (
              <Image
                src={business.logo_url}
                alt={`${business.name} Logo`}
                width={96}
                height={96}
                className="object-cover w-full h-full"
              />
            ) : (
              <Store className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Name */}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-foreground truncate">
            {business.name}
          </h1>

          {/* Badges */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-block text-sm font-medium text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
              {getCategoryLabel(business.category)}
            </span>

            {isOwner && <StatusBadge status={business.status} />}

            {business.is_featured && (
              <span className="text-xs font-semibold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">
                Empfohlen
              </span>
            )}
          </div>

          {/* Description */}
          {business.description && (
            <p className="text-sm text-muted-foreground mt-2">{business.description}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "published":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
          <CheckCircle className="h-3 w-3" />
          Veröffentlicht
        </span>
      )
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
          <Clock className="h-3 w-3" />
          In Prüfung
        </span>
      )
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
          <XCircle className="h-3 w-3" />
          Abgelehnt
        </span>
      )
    default:
      return null
  }
}
