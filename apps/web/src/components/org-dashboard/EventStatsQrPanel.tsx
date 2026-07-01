"use client"

import { useEffect, useState } from "react"
import { useActiveAccount } from "thirdweb/react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Eye,
  Users,
  MessageSquare,
  UserCheck,
  QrCode,
  ExternalLink,
  Copy,
  Loader2,
} from "lucide-react"
import { getOrgEventStats, getEventQrStatus, createEventQr } from "@/app/actions/org-events"
import type { OrgEventStats, EventQrStatus } from "@/lib/org-events-types"
import { CIRCLES_PLAYGROUND_URL } from "@/components/org-dashboard/OrgEventForm"

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="bg-card border border-border rounded-[10px] p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

export function EventStatsQrPanel({ eventId }: { eventId: string }) {
  const wallet = useActiveAccount()?.address
  const [stats, setStats] = useState<OrgEventStats | null>(null)
  const [qr, setQr] = useState<EventQrStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!wallet) return
    let active = true
    Promise.all([getOrgEventStats(eventId, wallet), getEventQrStatus(eventId, wallet)]).then(
      ([s, q]) => {
        if (!active) return
        if (s.success) setStats(s.stats)
        if (q.success) setQr(q.status)
        setLoading(false)
      }
    )
    return () => {
      active = false
    }
  }, [eventId, wallet])

  const handleCreateQr = async () => {
    setCreating(true)
    const r = await createEventQr(eventId, wallet)
    if (r.success) {
      setQr(r.status)
      toast.success("Anwesenheits-QR erstellt")
    } else {
      toast.error(r.error || "Fehler")
    }
    setCreating(false)
  }

  const copyUrl = () => {
    if (qr?.url) {
      navigator.clipboard.writeText(qr.url)
      toast.success("Link kopiert")
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-[10px] animate-pulse" />
        ))}
      </div>
    )
  }

  const utilization =
    stats?.maxAttendees && stats.maxAttendees > 0
      ? `${Math.round((stats.interests / stats.maxAttendees) * 100)}% von ${stats.maxAttendees}`
      : undefined

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Eye className="h-4 w-4" />}
          label="Aufrufe"
          value={stats?.views ?? 0}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Interessiert"
          value={stats?.interests ?? 0}
          hint={utilization}
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4" />}
          label="Erfahrungen"
          value={stats?.experiences ?? 0}
        />
        <StatCard
          icon={<UserCheck className="h-4 w-4" />}
          label="Anwesend (Beleg)"
          value={qr?.attendanceCount ?? 0}
        />
      </div>

      {/* Attendance QR */}
      <div className="bg-card border border-border rounded-[10px] p-6">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          <h3 className="font-medium text-lg">Nachweis der Teilnahme (Röbel Münzen)</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Wer diesen QR-Code am Eingang scannt, erhält seinen „War in Röbel“-Beleg in Röbel
          Münzen. Jeder Scan zählt als bestätigte Anwesenheit — bezahlt aus der Stadtkasse,
          nicht von dir.
        </p>

        {qr?.linked && qr.url ? (
          <div className="mt-4 flex flex-col sm:flex-row items-start gap-6">
            <div className="bg-white p-3 rounded-lg border border-border">
              <QRCodeSVG value={qr.url} size={180} />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-sm font-medium">
                  {qr.attendanceCount} bestätigte Anwesenheit
                  {qr.attendanceCount === 1 ? "" : "en"}
                </p>
                <p className="text-xs text-muted-foreground break-all mt-1">{qr.url}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={copyUrl}>
                  <Copy className="h-4 w-4 mr-2" />
                  Link kopieren
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={qr.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Öffnen
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <Button onClick={handleCreateQr} disabled={creating || !qr?.canCreate}>
              {creating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4 mr-2" />
              )}
              Anwesenheits-QR erstellen
            </Button>
            {qr && !qr.canCreate && qr.reason && (
              <p className="text-xs text-amber-600">{qr.reason}</p>
            )}
            <div>
              <a
                href={CIRCLES_PLAYGROUND_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Alternativ: QR-Code über Circles Playground erstellen
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
