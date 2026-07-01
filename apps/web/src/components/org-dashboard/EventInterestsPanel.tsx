"use client"

import { useEffect, useState } from "react"
import { useActiveAccount } from "thirdweb/react"
import { Button } from "@/components/ui/button"
import { Users, Download, UserCheck } from "lucide-react"
import { getOrgEventInterests } from "@/app/actions/org-events"
import type { EventInterest } from "@/lib/org-events-types"

export function EventInterestsPanel({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle: string
}) {
  const wallet = useActiveAccount()?.address
  const [interests, setInterests] = useState<EventInterest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!wallet) return
    let active = true
    getOrgEventInterests(eventId, wallet).then((r) => {
      if (!active) return
      if (r.success) setInterests(r.interests)
      else setError(r.error)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [eventId, wallet])

  const exportCsv = () => {
    const header = "Name,Angemeldet am\n"
    const body = interests
      .map((i) => {
        const date = i.created_at ? new Date(i.created_at).toLocaleString("de-DE") : ""
        const safeName = `"${i.name.replace(/"/g, '""')}"`
        return `${safeName},${date}`
      })
      .join("\n")
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `anmeldungen-${eventTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-medium text-lg">
            {interests.length} {interests.length === 1 ? "Anmeldung" : "Anmeldungen"}
          </h3>
        </div>
        {interests.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />
            CSV exportieren
          </Button>
        )}
      </div>

      {interests.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-[10px]">
          <UserCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Noch keine Anmeldungen. Interessierte erscheinen hier, sobald sie in der App auf
            „Interessiert“ tippen.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border bg-card border border-border rounded-[10px]">
          {interests.map((i, idx) => (
            <div key={`${i.wallet}-${idx}`} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                  {i.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium">{i.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {i.created_at ? new Date(i.created_at).toLocaleDateString("de-DE") : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
