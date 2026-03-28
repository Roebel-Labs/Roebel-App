"use client"

import { Clock } from "lucide-react"
import type { OpeningHours } from "@/types/business"
import { DAYS_OF_WEEK, isBusinessOpen } from "@/types/business"

interface BusinessOpeningHoursProps {
  hours: OpeningHours
}

export function BusinessOpeningHours({ hours }: BusinessOpeningHoursProps) {
  if (!hours || Object.keys(hours).length === 0) return null

  const open = isBusinessOpen(hours)

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Öffnungszeiten</h3>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            open
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {open ? "Jetzt geöffnet" : "Geschlossen"}
        </span>
      </div>

      <div className="space-y-1.5">
        {DAYS_OF_WEEK.map((day) => {
          const entry = hours[day.value]
          const now = new Date()
          const dayIndex = now.getDay()
          const dayMap = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"]
          const isToday = dayMap[dayIndex] === day.value

          return (
            <div
              key={day.value}
              className={`flex items-center justify-between py-1 px-2 rounded text-sm ${
                isToday ? "bg-blue-50 font-medium" : ""
              }`}
            >
              <span className={isToday ? "text-blue-900" : "text-foreground"}>
                {day.label}
              </span>
              <span className={isToday ? "text-blue-700" : "text-muted-foreground"}>
                {entry && !entry.closed
                  ? `${entry.open} – ${entry.close}`
                  : "Geschlossen"}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
