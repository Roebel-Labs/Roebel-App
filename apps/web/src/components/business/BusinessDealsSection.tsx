"use client"

import { Tag } from "lucide-react"
import type { BusinessDeal } from "@/types/business"
import { DealCard } from "./DealCard"

interface BusinessDealsSectionProps {
  deals: BusinessDeal[]
}

export function BusinessDealsSection({ deals }: BusinessDealsSectionProps) {
  if (!deals || deals.length === 0) return null

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Aktuelle Angebote</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  )
}
