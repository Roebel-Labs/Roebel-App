"use client"

// Event requests: the official pages the daily job reads, and every request with its state.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RefreshCw, Trash2 } from "lucide-react"
import {
  addEventSource, deleteEventSource, getEventRequestsOverview, runEventSourceNow, setEventSourceEnabled, settleOverdueNow,
  type EventRequestsOverview,
} from "@/app/actions/event-requests"

const NO_ORG = "none"

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending_org: { label: "Wartet auf Organisation", className: "bg-amber-100 text-amber-800" },
  published_org: { label: "Von Organisation veröffentlicht", className: "bg-green-100 text-green-800" },
  published_default: { label: "Unter Röbel.APP News eingestellt", className: "bg-blue-100 text-blue-800" },
  team_review: { label: "Zur Prüfung beim Team", className: "bg-gray-100 text-gray-800" },
  rejected: { label: "Abgelehnt oder verfallen", className: "bg-red-100 text-red-800" },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "noch nie"
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function EventRequestsAdminPage() {
  const [data, setData] = useState<EventRequestsOverview | null>(null)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [accountId, setAccountId] = useState(NO_ORG)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await getEventRequestsOverview())
    } catch {
      toast.error("Die Übersicht konnte nicht geladen werden.")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy("add")
    const res = await addEventSource({ name, url, accountId: accountId === NO_ORG ? null : accountId })
    setBusy(null)
    if (res.success) {
      toast.success(res.message)
      setName("")
      setUrl("")
      setAccountId(NO_ORG)
      load()
    } else toast.error(res.message)
  }

  async function onRun(id: string) {
    setBusy(id)
    const t = toast.loading("Seite wird gelesen…")
    try {
      const res = await runEventSourceNow(id)
      if (res.success) toast.success(res.message, { id: t })
      else toast.error(res.message, { id: t })
    } catch {
      toast.error("Abruf fehlgeschlagen.", { id: t })
    }
    setBusy(null)
    load()
  }

  async function onSettle() {
    setBusy("settle")
    const res = await settleOverdueNow()
    setBusy(null)
    toast.success(res.message)
    load()
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-medium text-foreground">Veranstaltungs-Anfragen</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Gefundene Veranstaltungen gehen als Anfrage an die zuständige Organisation. Sie bekommt eine
          Mitteilung und veröffentlicht unter ihrem eigenen Konto. Antwortet sie zwei Tage nicht, wird die
          Veranstaltung unter Röbel.APP News eingestellt.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-medium">Offizielle Quellen</h2>
        <p className="text-sm text-muted-foreground">
          Diese Seiten werden jeden Morgen gelesen. Gehört eine Seite genau einer Organisation, wähle sie aus,
          dann gehen alle Anfragen von dort an sie.
        </p>
        <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3 rounded-[10px] border border-border bg-card p-4">
          <div className="min-w-[180px] flex-1">
            <label className="text-sm font-medium" htmlFor="source-name">Name</label>
            <Input id="source-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Stadt Röbel, Veranstaltungen" className="mt-1" required />
          </div>
          <div className="min-w-[260px] flex-[2]">
            <label className="text-sm font-medium" htmlFor="source-url">Adresse</label>
            <Input id="source-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="mt-1" required />
          </div>
          <div className="min-w-[220px]">
            <label className="text-sm font-medium">Organisation</label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ORG}>Nach Veranstalter zuordnen</SelectItem>
                {(data?.organisations ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy === "add"}>Quelle hinzufügen</Button>
        </form>

        <div className="space-y-2">
          {data && data.sources.length === 0 && (
            <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Noch keine Quelle eingetragen. Ohne Quellen liest der tägliche Abruf nichts.
            </p>
          )}
          {(data?.sources ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name}</p>
                <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-muted-foreground underline-offset-2 hover:underline">{s.url}</a>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.account_name ? `Anfragen an ${s.account_name}` : "Zuordnung nach Veranstalter"} · Letzter Abruf: {formatDateTime(s.last_run_at)}
                  {s.last_status ? ` · ${s.last_status}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={busy === s.id} onClick={() => onRun(s.id)}>
                <RefreshCw className={`mr-2 h-4 w-4 ${busy === s.id ? "animate-spin" : ""}`} />
                Jetzt abrufen
              </Button>
              <Button variant="outline" size="sm" onClick={async () => { await setEventSourceEnabled(s.id, !s.enabled); load() }}>
                {s.enabled ? "Pausieren" : "Aktivieren"}
              </Button>
              <Button variant="ghost" size="sm" aria-label="Quelle löschen" onClick={async () => { await deleteEventSource(s.id); load() }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-medium">Anfragen</h2>
          <Button variant="outline" size="sm" disabled={busy === "settle"} onClick={onSettle}>Fällige jetzt abschließen</Button>
        </div>
        <div className="space-y-2">
          {data && data.requests.length === 0 && (
            <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Noch keine Anfragen.</p>
          )}
          {(data?.requests ?? []).map((r) => {
            const status = STATUS_LABEL[r.status] ?? { label: r.status, className: "bg-gray-100 text-gray-800" }
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(r.date)} · {r.account_name ?? r.organizer_name ?? "Veranstalter unbekannt"} ·{" "}
                    {r.source === "crawl" ? "von einer offiziellen Seite" : "weitergeleitet"}
                    {r.status === "pending_org" ? ` · Frist bis ${formatDateTime(r.expires_at)}` : ""}
                  </p>
                </div>
                <Badge className={status.className}>{status.label}</Badge>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
