"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tent, Mail } from "lucide-react"
import {
  listSommercampRegistrations,
  type SommercampRegistration,
} from "@/app/actions/sommercamp"

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

export default function SommercampAdminPage() {
  const [rows, setRows] = useState<SommercampRegistration[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSommercampRegistrations()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const newsletterCount = rows?.filter((r) => r.newsletter_opt_in).length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Tent className="h-6 w-6 text-[#00498B]" />
          Sommer Camp – Anmeldungen
        </h1>
        <p className="text-sm text-muted-foreground">
          Mini-App Hackathon · 6 Wochen-Runden über die Sommerferien (Start
          freitags 18&nbsp;Uhr) · Landing page: /sommercamp
        </p>
      </div>

      {error ? (
        <Card className="p-6 text-sm text-red-600">{error}</Card>
      ) : !rows ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-4">
            <Card className="flex-1 p-4">
              <p className="text-3xl font-bold">{rows.length}</p>
              <p className="text-xs text-muted-foreground">Anmeldungen</p>
            </Card>
            <Card className="flex-1 p-4">
              <p className="text-3xl font-bold">{newsletterCount}</p>
              <p className="text-xs text-muted-foreground">Newsletter-Opt-ins</p>
            </Card>
          </div>

          {rows.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Noch keine Anmeldungen — sobald jemand den QR-Code scannt und sich
              anmeldet, erscheint die Person hier.
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Alter</th>
                    <th className="px-4 py-3">Angemeldet</th>
                    <th className="px-4 py-3">Newsletter</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3">{r.age ?? "–"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {DATE_FMT.format(new Date(r.created_at))}
                      </td>
                      <td className="px-4 py-3">
                        {r.newsletter_opt_in ? (
                          <Mail className="h-4 w-4 text-green-600" />
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
