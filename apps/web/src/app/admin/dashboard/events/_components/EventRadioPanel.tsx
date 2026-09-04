"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, FileText, Radio, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { setEventRadioEnabled, setEventRadioVoiceId } from "@/app/actions/app-settings"
import { getEventRadioOverview, type EventRadioOverview, type SegmentView } from "@/app/actions/event-radio"

type DryRunScripts = { intro?: string; outro?: string; events: Record<string, string> }

function formatDe(iso: string | null): string {
  if (!iso) return "noch nie"
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
}

function SegmentRow({ label, meta, segment, status }: {
  label: string
  meta?: string
  segment: SegmentView | null
  status?: "current" | "stale" | "missing"
}) {
  const badge =
    status === "current" ? <Badge variant="secondary">Aktuell</Badge>
    : status === "stale" ? <Badge variant="outline">Veraltet</Badge>
    : status === "missing" ? <Badge variant="destructive">Fehlt</Badge>
    : null
  return (
    <div className="rounded-[10px] border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {badge}
      </div>
      {segment ? (
        <>
          <audio controls preload="none" src={segment.audioUrl} className="w-full h-9" />
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground">
              <ChevronDown className="h-3 w-3" /> Skript anzeigen
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-2 text-sm whitespace-pre-wrap">{segment.script}</p>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Noch kein Beitrag generiert.</p>
      )}
    </div>
  )
}

/**
 * Wochen-Radio: Mecky's narrated event stories. Lists the current week's
 * clips, holds the voice id and the app kill switch, and triggers generation.
 */
export function EventRadioPanel() {
  const [overview, setOverview] = useState<EventRadioOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [voiceInput, setVoiceInput] = useState("")
  const [busy, setBusy] = useState<"dry" | "force" | null>(null)
  const [scripts, setScripts] = useState<DryRunScripts | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getEventRadioOverview()
      setOverview(data)
      setVoiceInput(data.voiceId ?? "")
    } catch (err) {
      toast.error("Wochen-Radio konnte nicht geladen werden", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const saveVoice = async () => {
    const result = await setEventRadioVoiceId(voiceInput || null)
    if (!result.success) return toast.error("Fehler beim Speichern", { description: result.error })
    toast.success("Stimme gespeichert")
    void load()
  }

  const toggleEnabled = async (enabled: boolean) => {
    setOverview((o) => (o ? { ...o, enabled } : o))
    const result = await setEventRadioEnabled(enabled)
    if (!result.success) {
      toast.error("Fehler beim Speichern", { description: result.error })
      void load()
    }
  }

  const generate = async (mode: "dry" | "force") => {
    setBusy(mode)
    try {
      const res = await fetch("/api/event-radio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "dry" ? { dryRun: true } : { force: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      if (data.skipped_reason === "voice_id_missing") return toast.error("Bitte zuerst eine Stimme (Voice ID) speichern.")
      if (data.skipped_reason === "api_key_missing") return toast.error("ELEVENLABS_API_KEY fehlt auf dem Server.")
      if (mode === "dry") {
        setScripts(data.scripts ?? { events: {} })
        return
      }
      const failed: Array<{ scope: string; message: string }> = data.errors ?? []
      const count = (data.generated?.events?.length ?? 0) + (data.generated?.intro ? 1 : 0) + (data.generated?.outro ? 1 : 0)
      if (failed.length > 0) toast.warning(`${count} Beiträge erzeugt, ${failed.length} fehlgeschlagen`, { description: failed[0].message })
      else toast.success(`${count} Beiträge erzeugt`)
      void load()
    } catch (err) {
      toast.error("Generierung fehlgeschlagen", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-[10px] border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h2 className="text-base font-medium">Wochen-Radio</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">In der App aktiv</span>
          <Switch checked={overview?.enabled ?? true} onCheckedChange={toggleEnabled} disabled={loading} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Mecky moderiert die Event-Stories: ein eigener Beitrag pro Veranstaltung, dazu Intro und Outro.
        Wird täglich neu erzeugt, nur geänderte Veranstaltungen werden neu eingesprochen.
        Zuletzt generiert: {formatDe(overview?.lastGeneratedAt ?? null)}.
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">ElevenLabs Voice ID (Mecky)</label>
          <Input value={voiceInput} onChange={(e) => setVoiceInput(e.target.value)} placeholder="z. B. 21m00Tcm4TlvDq8ikWAM" />
        </div>
        <Button variant="outline" onClick={saveVoice} disabled={loading}>Speichern</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => generate("dry")} disabled={busy !== null}>
          <FileText className="h-4 w-4 mr-1" /> {busy === "dry" ? "Schreibt…" : "Skripte prüfen"}
        </Button>
        <Button onClick={() => generate("force")} disabled={busy !== null}>
          <RefreshCw className={`h-4 w-4 mr-1 ${busy === "force" ? "animate-spin" : ""}`} />
          {busy === "force" ? "Generiert…" : "Jetzt neu generieren"}
        </Button>
      </div>

      {loading || !overview ? (
        <Skeleton className="h-[120px] w-full rounded-[10px]" />
      ) : (
        <div className="space-y-2">
          <SegmentRow label="Intro" meta={`für ${overview.window.start}`} segment={overview.intro} />
          {overview.events.map((e) => (
            <SegmentRow key={e.id} label={e.title} meta={e.date} segment={e.segment} status={e.status} />
          ))}
          <SegmentRow label="Outro" meta={`Woche ${overview.window.weekKey}`} segment={overview.outro} />
        </div>
      )}

      <Dialog open={scripts !== null} onOpenChange={(open) => !open && setScripts(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Skripte (Probelauf, keine Audio-Kosten)</DialogTitle>
          </DialogHeader>
          {scripts ? (
            <div className="space-y-4 text-sm">
              {scripts.intro ? (<div><p className="font-medium">Intro</p><p className="whitespace-pre-wrap">{scripts.intro}</p></div>) : null}
              {Object.entries(scripts.events).map(([id, script]) => (
                <div key={id}>
                  <p className="font-medium">{overview?.events.find((e) => e.id === id)?.title ?? id}</p>
                  <p className="whitespace-pre-wrap">{script}</p>
                </div>
              ))}
              {scripts.outro ? (<div><p className="font-medium">Outro</p><p className="whitespace-pre-wrap">{scripts.outro}</p></div>) : null}
              {!scripts.intro && !scripts.outro && Object.keys(scripts.events).length === 0 ? (
                <p className="text-muted-foreground">Alles aktuell, nichts neu zu schreiben.</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
