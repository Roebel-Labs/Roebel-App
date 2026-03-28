"use client"

import { Circle, CheckCircle, Pause, Clock } from "lucide-react"
import type { DealStatus } from "@/types/business"

interface AdStatusBadgeProps {
  status: DealStatus
}

const statusConfig: Record<DealStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: {
    label: "Entwurf",
    color: "bg-muted text-foreground",
    icon: <Circle className="h-3 w-3" />,
  },
  active: {
    label: "Aktiv",
    color: "bg-green-50 text-green-700",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  paused: {
    label: "Pausiert",
    color: "bg-amber-50 text-amber-700",
    icon: <Pause className="h-3 w-3" />,
  },
  expired: {
    label: "Abgelaufen",
    color: "bg-red-50 text-red-700",
    icon: <Clock className="h-3 w-3" />,
  },
}

export function AdStatusBadge({ status }: AdStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  )
}
