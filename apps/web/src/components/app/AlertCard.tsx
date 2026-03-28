"use client"

import {
  Droplets,
  Construction,
  CloudLightning,
  Flame,
  AlertTriangle,
  MapPin,
  Clock,
} from "lucide-react"

interface AlertCardProps {
  id: string
  title: string
  description?: string | null
  alert_type: string
  severity: string
  location?: string | null
  starts_at: string
  ends_at?: string | null
}

const alertTypeConfig: Record<
  string,
  { label: string; icon: typeof AlertTriangle }
> = {
  water_outage: { label: "Wasserausfall", icon: Droplets },
  road_closure: { label: "Straßensperrung", icon: Construction },
  storm_warning: { label: "Sturmwarnung", icon: CloudLightning },
  fire_department: { label: "Feuerwehr", icon: Flame },
  general: { label: "Hinweis", icon: AlertTriangle },
}

const severityStyles: Record<
  string,
  { card: string; icon: string; badge: string }
> = {
  critical: {
    card: "border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",
    icon: "text-red-600 dark:text-red-400",
    badge:
      "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  },
  warning: {
    card: "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
    icon: "text-amber-600 dark:text-amber-400",
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  },
  info: {
    card: "border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
    icon: "text-blue-600 dark:text-blue-400",
    badge:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  },
}

const severityLabels: Record<string, string> = {
  critical: "Kritisch",
  warning: "Warnung",
  info: "Info",
}

function formatAlertTime(startsAt: string, endsAt?: string | null) {
  const start = new Date(startsAt)
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }
  const startStr = start.toLocaleDateString("de-DE", opts)

  if (!endsAt) return `Seit ${startStr}`

  const end = new Date(endsAt)
  const endStr = end.toLocaleDateString("de-DE", opts)
  return `${startStr} — ${endStr}`
}

export function AlertCard({
  title,
  description,
  alert_type,
  severity,
  location,
  starts_at,
  ends_at,
}: AlertCardProps) {
  const typeConfig = alertTypeConfig[alert_type] || alertTypeConfig.general
  const styles = severityStyles[severity] || severityStyles.warning
  const Icon = typeConfig.icon

  return (
    <div className={`rounded-lg border overflow-hidden ${styles.card}`}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${styles.icon} bg-white/60 dark:bg-white/10`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles.badge}`}
              >
                {severityLabels[severity] || "Warnung"}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {typeConfig.label}
              </span>
            </div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {description}
              </p>
            )}
            {/* Meta */}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatAlertTime(starts_at, ends_at)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
