"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, FileUp, Hand, Pause, Play, Save, Square, Trash2, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteAudioEpisode,
  getAudioEpisode,
  getAudioShow,
  saveAudioEpisode,
  type AudioEpisodeInput,
  type AudioShow,
  type AudioStatus,
} from "@/app/actions/audio-content"
import { MediaUpload, readAudioDuration } from "@/components/admin/hoeren/media-upload"
import {
  detectTranscriptFormat,
  formatTimestamp,
  parseTranscript,
  withEnds,
  type TranscriptSegment,
} from "@/lib/audio-transcript"
import { STATUS_LABEL, formatDuration } from "../../../labels"

const FORMAT_LABEL: Record<string, string> = {
  plain: "Fließtext – Zeiten geschätzt",
  srt: "SRT-Untertitel – exakte Zeiten",
  vtt: "WebVTT – exakte Zeiten",
  lrc: "LRC – exakte Zeiten",
  tapped: "Per Tippen synchronisiert",
}

type Form = Omit<AudioEpisodeInput, "show_id" | "transcript" | "transcript_source">

const EMPTY: Form = {
  episode_number: null,
  title: "",
  description: "",
  cover_url: "",
  audio_url: "",
  duration_seconds: null,
  status: "draft",
}

export default function AudioEpisodePage() {
  const params = useParams<{ id: string; episodeId: string }>()
  const router = useRouter()
  const isNew = params.episodeId === "new"
  const backHref = `/admin/dashboard/hoeren/${params.id}`

  const [show, setShow] = useState<AudioShow | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [rawText, setRawText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Preview / tap-sync player state
  const audioRef = useRef<HTMLAudioElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [syncIndex, setSyncIndex] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      const showRes = await getAudioShow(params.id)
      if (!showRes.success) {
        toast.error("Reihe nicht gefunden", { description: showRes.error })
        router.push("/admin/dashboard/hoeren")
        return
      }
      setShow(showRes.data.show)
      if (isNew) {
        const next = Math.max(0, ...showRes.data.episodes.map((e) => e.episode_number ?? 0)) + 1
        setForm({ ...EMPTY, episode_number: next })
        setLoading(false)
        return
      }
      const res = await getAudioEpisode(params.episodeId)
      if (!res.success) {
        toast.error("Folge nicht gefunden", { description: res.error })
        router.push(backHref)
        return
      }
      const e = res.data
      setForm({
        episode_number: e.episode_number,
        title: e.title,
        description: e.description ?? "",
        cover_url: e.cover_url ?? "",
        audio_url: e.audio_url ?? "",
        duration_seconds: e.duration_seconds,
        status: e.status,
      })
      setSegments(e.transcript ?? [])
      setSource(e.transcript_source)
      setLoading(false)
    })()
  }, [backHref, isNew, params.episodeId, params.id, router])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const onAudio = useCallback(async (url: string) => {
    setForm((f) => ({ ...f, audio_url: url }))
    if (!url) return
    const duration = await readAudioDuration(url)
    if (duration) setForm((f) => ({ ...f, duration_seconds: Math.round(duration * 10) / 10 }))
  }, [])

  // ─── Transcript import ────────────────────────────────────
  const applyText = () => {
    if (!rawText.trim()) return
    const { format, segments: parsed } = parseTranscript(rawText, form.duration_seconds)
    if (parsed.length === 0) {
      toast.error("Kein Text erkannt")
      return
    }
    if (format === "plain" && !form.duration_seconds) {
      toast.warning("Erst die Audiodatei hochladen", {
        description: "Ohne Audiolänge können die Zeiten nicht geschätzt werden.",
      })
    }
    setSegments(parsed)
    setSource(format)
    toast.success(`${parsed.length} Textabschnitte übernommen`, { description: FORMAT_LABEL[format] })
  }

  const onTextFile = async (file: File | undefined) => {
    if (!file) return
    setRawText(await file.text())
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const detected = rawText.trim() ? detectTranscriptFormat(rawText) : null

  // ─── Preview + tap-sync ───────────────────────────────────
  const activeIndex = (() => {
    if (syncIndex !== null) return syncIndex
    let idx = -1
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= time + 0.05) idx = i
      else break
    }
    return idx
  })()

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-seg="${activeIndex}"]`)
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [activeIndex])

  const seek = (seconds: number) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = Math.max(0, seconds)
    setTime(a.currentTime)
  }

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }

  const startSync = () => {
    const a = audioRef.current
    if (!a || segments.length === 0) return
    setSegments((s) => s.map((seg, i) => (i === 0 ? { ...seg, start: 0 } : seg)))
    setSyncIndex(0)
    a.currentTime = 0
    void a.play()
  }

  const finishSync = useCallback(
    (lastIndex: number) => {
      setSegments((s) => withEnds(s.map(({ start, text }) => ({ start, text })), form.duration_seconds))
      setSource("tapped")
      setSyncIndex(null)
      audioRef.current?.pause()
      toast.success("Synchronisiert", {
        description:
          lastIndex + 1 < segments.length
            ? `Abschnitte ab ${lastIndex + 2} behalten ihre bisherigen Zeiten.`
            : "Alle Abschnitte haben jetzt echte Zeiten. Speichern nicht vergessen.",
      })
    },
    [form.duration_seconds, segments.length],
  )

  const tap = useCallback(() => {
    const a = audioRef.current
    if (!a || syncIndex === null) return
    const next = syncIndex + 1
    if (next >= segments.length) {
      finishSync(syncIndex)
      return
    }
    const now = Math.round(a.currentTime * 100) / 100
    setSegments((s) => s.map((seg, i) => (i === next ? { ...seg, start: now } : seg)))
    setSyncIndex(next)
  }, [finishSync, segments.length, syncIndex])

  useEffect(() => {
    if (syncIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowDown") {
        e.preventDefault()
        tap()
      } else if (e.code === "Escape") {
        finishSync(syncIndex)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [finishSync, syncIndex, tap])

  const nudge = (i: number, delta: number) =>
    setSegments((s) => {
      const updated = s.map((seg, j) => (j === i ? { ...seg, start: Math.max(0, Math.round((seg.start + delta) * 100) / 100) } : seg))
      return withEnds(updated, form.duration_seconds)
    })

  const editText = (i: number, text: string) =>
    setSegments((s) => s.map((seg, j) => (j === i ? { ...seg, text } : seg)))

  // ─── Save ─────────────────────────────────────────────────
  const save = async (status?: AudioStatus) => {
    setSaving(true)
    const res = await saveAudioEpisode(isNew ? null : params.episodeId, {
      ...form,
      status: status ?? form.status,
      show_id: params.id,
      transcript: segments,
      transcript_source: segments.length ? source : null,
    })
    setSaving(false)
    if (!res.success) {
      toast.error("Speichern fehlgeschlagen", { description: res.error })
      return
    }
    if (status) set("status", status)
    toast.success(status === "published" ? "Folge veröffentlicht" : "Folge gespeichert")
    if (isNew) router.replace(`/admin/dashboard/hoeren/${params.id}/folge/${res.data.id}`)
  }

  const remove = async () => {
    if (!confirm(`Folge „${form.title}“ löschen?`)) return
    const res = await deleteAudioEpisode(params.episodeId, params.id)
    if (!res.success) {
      toast.error("Löschen fehlgeschlagen", { description: res.error })
      return
    }
    router.push(backHref)
  }

  if (loading) return <div className="mx-auto h-96 max-w-5xl animate-pulse rounded-[10px] bg-muted" />

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{show?.title}</p>
          <h1 className="text-3xl font-medium text-foreground">{isNew ? "Neue Folge" : form.title || "Folge"}</h1>
        </div>
        {!isNew && (
          <Badge variant={form.status === "published" ? "default" : "secondary"}>{STATUS_LABEL[form.status]}</Badge>
        )}
      </div>

      {/* 1 · Audio */}
      <section className="space-y-3 rounded-[10px] border border-border bg-card p-6">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-medium">1 · Audio</h3>
          <span className="text-sm text-muted-foreground">Länge {formatDuration(form.duration_seconds)}</span>
        </div>
        <MediaUpload kind="audio" value={form.audio_url} onChange={(url) => void onAudio(url)} />
      </section>

      {/* 2 · Details */}
      <section className="grid gap-6 rounded-[10px] border border-border bg-card p-6 md:grid-cols-[1fr_200px]">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">2 · Details</h3>
          <div className="grid grid-cols-[100px_1fr] gap-4">
            <div>
              <Label htmlFor="num">Nr.</Label>
              <Input
                id="num"
                type="number"
                value={form.episode_number ?? ""}
                onChange={(e) => set("episode_number", e.target.value ? Number(e.target.value) : null)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="title">Titel *</Label>
              <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="desc">Beschreibung / Shownotes</Label>
            <Textarea
              id="desc"
              rows={4}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Eigenes Cover (optional)</Label>
          <MediaUpload kind="cover" value={form.cover_url} onChange={(url) => set("cover_url", url)} />
          <p className="text-xs text-muted-foreground">Leer lassen = Cover der Reihe.</p>
        </div>
      </section>

      {/* 3 · Text */}
      <section className="space-y-4 rounded-[10px] border border-border bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-medium">3 · Mitlaufender Text</h3>
          {segments.length > 0 && source && (
            <span className="text-sm text-muted-foreground">
              {segments.length} Abschnitte · {FORMAT_LABEL[source] ?? source}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Text einfügen oder Datei laden. Fließtext wird in Absätze zerlegt und grob über die Audiolänge verteilt –
          danach mit <strong>Per Tippen synchronisieren</strong> exakt machen. SRT, WebVTT und LRC bringen ihre Zeiten
          mit (SRT gibt es z. B. unter Transkription).
        </p>
        <Textarea
          rows={8}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={"Es war einmal in Röbel …\n\nAbsätze durch Leerzeilen trennen."}
          className="font-mono text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.srt,.vtt,.lrc,text/plain"
            className="hidden"
            onChange={(e) => void onTextFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" />
            Datei laden
          </Button>
          <Button type="button" onClick={applyText} disabled={!rawText.trim()}>
            <Wand2 className="mr-2 h-4 w-4" />
            Text übernehmen
          </Button>
          {detected && <span className="text-sm text-muted-foreground">Erkannt: {FORMAT_LABEL[detected]}</span>}
        </div>
      </section>

      {/* 4 · Preview + sync */}
      {segments.length > 0 && (
        <section className="space-y-4 rounded-[10px] border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-medium">4 · Vorschau &amp; Synchronisieren</h3>
            {form.audio_url && (
              <div className="flex gap-2">
                {syncIndex === null ? (
                  <>
                    <Button type="button" variant="outline" onClick={togglePlay}>
                      {playing ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                      {playing ? "Pause" : "Vorschau"}
                    </Button>
                    <Button type="button" onClick={startSync}>
                      <Hand className="mr-2 h-4 w-4" />
                      Per Tippen synchronisieren
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" onClick={tap}>
                      <Hand className="mr-2 h-4 w-4" />
                      Nächster Abschnitt (Leertaste)
                    </Button>
                    <Button type="button" variant="outline" onClick={() => finishSync(syncIndex)}>
                      <Square className="mr-2 h-4 w-4" />
                      Fertig
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {syncIndex !== null && (
            <p className="rounded-md bg-primary/10 p-3 text-sm text-foreground">
              Hör zu und drück die <strong>Leertaste</strong> genau dann, wenn der <strong>nächste</strong> Abschnitt
              beginnt. Esc beendet.
            </p>
          )}

          {form.audio_url && (
            <audio
              ref={audioRef}
              src={form.audio_url}
              controls
              className="w-full"
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => syncIndex !== null && finishSync(syncIndex)}
            />
          )}

          <div
            ref={listRef}
            className="max-h-[520px] space-y-1 overflow-y-auto rounded-[10px] p-4"
            style={{ backgroundColor: show?.accent_color ?? "#2a1d15" }}
          >
            {segments.map((seg, i) => {
              const active = i === activeIndex
              const past = i < activeIndex
              return (
                <div key={i} data-seg={i} className="group flex items-start gap-3 rounded-md px-2 py-2">
                  <div className="flex w-24 shrink-0 flex-col items-start gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => seek(seg.start)}
                      className="font-mono text-xs text-white/60 hover:text-white"
                      title="Hierhin springen"
                    >
                      {formatTimestamp(seg.start)}
                    </button>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => nudge(i, -0.5)}
                        className="rounded bg-white/10 px-1.5 text-xs text-white"
                      >
                        −½s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(i, 0.5)}
                        className="rounded bg-white/10 px-1.5 text-xs text-white"
                      >
                        +½s
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={seg.text}
                    onChange={(e) => editText(i, e.target.value)}
                    rows={Math.max(1, Math.ceil(seg.text.length / 70))}
                    className={`w-full resize-none bg-transparent text-lg font-semibold leading-snug outline-none transition-colors ${
                      active ? "text-white" : past ? "text-white/45" : "text-white/25"
                    }`}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            So ungefähr sieht es in der App aus. Zeit anklicken = dorthin springen; Text direkt korrigierbar.
          </p>
        </section>
      )}

      <div className="flex items-center justify-between rounded-[10px] border border-border bg-card p-6">
        {isNew ? (
          <span />
        ) : (
          <Button variant="outline" onClick={remove} disabled={saving} className="text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            Löschen
          </Button>
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => save()} disabled={saving || !form.title}>
            <Save className="mr-2 h-4 w-4" />
            Speichern
          </Button>
          {form.status !== "published" ? (
            <Button onClick={() => save("published")} disabled={saving || !form.title || !form.audio_url}>
              Veröffentlichen
            </Button>
          ) : (
            <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
              Zurückziehen
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
