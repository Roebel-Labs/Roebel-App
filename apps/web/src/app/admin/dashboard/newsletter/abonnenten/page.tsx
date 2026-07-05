"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Search, UserPlus, Upload, Download, Send, Trash2, BellOff } from "lucide-react"
import { toast } from "sonner"
import {
  listSubscribers, addSubscriberManually, importSubscribers, setSubscriberUnsubscribed,
  deleteSubscriberById, exportSubscribersCsv, inviteAppUsers,
  type NewsletterSubscriber,
} from "@/app/actions/newsletter"
import { NewsletterNav } from "../_components/newsletter-nav"

const EMAIL_EXTRACT_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const STATUS_LABEL: Record<NewsletterSubscriber["status"], { label: string; className: string }> = {
  active: { label: "Aktiv", className: "bg-green-100 text-green-800" },
  pending: { label: "Unbestätigt", className: "bg-amber-100 text-amber-800" },
  unsubscribed: { label: "Abgemeldet", className: "bg-gray-100 text-gray-600" },
  bounced: { label: "Bounce", className: "bg-red-100 text-red-800" },
  complained: { label: "Beschwerde", className: "bg-red-100 text-red-800" },
}

const SOURCE_LABEL: Record<NewsletterSubscriber["source"], string> = {
  signup: "Anmeldung",
  import: "Import",
  app_user: "App-Nutzer",
  admin: "Manuell",
}

export default function NewsletterSubscribersPage() {
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [newEmail, setNewEmail] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setSubscribers(await listSubscribers({ search, status: statusFilter }))
    setLoading(false)
  }, [search, statusFilter])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function handleAdd() {
    const result = await addSubscriberManually(newEmail)
    if (result.success) {
      toast.success(result.message)
      setNewEmail("")
      load()
    } else {
      toast.error(result.message)
    }
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    const emails = Array.from(new Set(text.match(EMAIL_EXTRACT_RE) ?? []))
    if (emails.length === 0) {
      toast.error("Keine E-Mail-Adressen in der Datei gefunden.")
      return
    }
    const t = toast.loading(`${emails.length} Adressen werden importiert…`)
    const result = await importSubscribers(emails)
    toast.success(`${result.added} importiert, ${result.skipped} übersprungen (Duplikate/ungültig).`, { id: t })
    load()
  }

  async function handleExport() {
    const csv = await exportSubscribersCsv()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `newsletter-abonnenten-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleInvite() {
    const t = toast.loading("Einladungen werden versendet… (dauert bei vielen Nutzern etwas)")
    const result = await inviteAppUsers()
    if (result.failed > 0) {
      toast.warning(
        `${result.invited} Einladungen versendet, ${result.failed} fehlgeschlagen. ${result.alreadySubscribed} Nutzer waren bereits eingetragen.`,
        { id: t }
      )
    } else {
      toast.success(
        `${result.invited} Einladungen versendet. ${result.alreadySubscribed} Nutzer waren bereits eingetragen.`,
        { id: t }
      )
    }
    load()
  }

  async function handleUnsubscribe(id: string) {
    const result = await setSubscriberUnsubscribed(id)
    if (result.success) { toast.success("Abgemeldet.") ; load() } else toast.error("Fehlgeschlagen.")
  }

  async function handleDelete(id: string) {
    const result = await deleteSubscriberById(id)
    if (result.success) { toast.success("Gelöscht (DSGVO).") ; load() } else toast.error("Fehlgeschlagen.")
  }

  const counts = subscribers.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Abonnenten</h1>
          <p className="text-sm text-gray-500">
            {counts.active ?? 0} aktiv · {counts.pending ?? 0} unbestätigt · {counts.unsubscribed ?? 0} abgemeldet
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              e.target.value = ""
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> CSV-Import
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="bg-[#00498B] hover:bg-[#003a70]">
                <Send className="mr-2 h-4 w-4" /> Bestehende Nutzer einladen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>App-Nutzer einladen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle App-Nutzer mit E-Mail-Adresse, die noch nicht im Verteiler sind, erhalten
                  eine Einladungs-E-Mail mit Bestätigungslink (Double-Opt-in). Bereits
                  eingeladene oder eingetragene Nutzer werden übersprungen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleInvite}>Einladungen senden</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <NewsletterNav active="abonnenten" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input className="pl-9" placeholder="E-Mail suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="pending">Unbestätigt</SelectItem>
            <SelectItem value="unsubscribed">Abgemeldet</SelectItem>
            <SelectItem value="bounced">Bounce</SelectItem>
            <SelectItem value="complained">Beschwerde</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            className="w-[220px]"
            type="email"
            placeholder="neue@email.de"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button variant="outline" onClick={handleAdd}>
            <UserPlus className="mr-2 h-4 w-4" /> Hinzufügen
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3">E-Mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Quelle</th>
                <th className="px-4 py-3">Seit</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Keine Abonnenten gefunden.</td></tr>
              ) : (
                subscribers.map((s) => {
                  const badge = STATUS_LABEL[s.status]
                  return (
                    <tr key={s.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.email}</td>
                      <td className="px-4 py-3"><Badge className={badge.className}>{badge.label}</Badge></td>
                      <td className="px-4 py-3 text-gray-600">{SOURCE_LABEL[s.source]}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleDateString("de-DE")}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {s.status === "active" && (
                            <Button variant="ghost" size="icon" title="Abmelden" onClick={() => handleUnsubscribe(s.id)}>
                              <BellOff className="h-4 w-4 text-gray-500" />
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Endgültig löschen (DSGVO)">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{s.email} endgültig löschen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Entfernt alle Daten dieser Person unwiderruflich (DSGVO-Löschung).
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(s.id)}>Löschen</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
