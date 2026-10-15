"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, FileText, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  deleteAudioShow,
  getAudioShow,
  saveAudioShow,
  type AudioEpisode,
  type AudioKind,
  type AudioShowInput,
  type AudioStatus,
} from "@/app/actions/audio-content"
import { MediaUpload, extractAccentColor } from "@/components/admin/hoeren/media-upload"
import { KIND_LABEL, STATUS_LABEL, formatDuration } from "../labels"

const EMPTY: AudioShowInput = {
  kind: "short_story",
  title: "",
  author: "",
  description: "",
  cover_url: "",
  accent_color: "",
  language: "de",
  status: "draft",
  sort_order: 0,
}

export default function AudioShowPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = params.id === "new"
  const [form, setForm] = useState<AudioShowInput>(EMPTY)
  const [episodes, setEpisodes] = useState<AudioEpisode[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) return
    getAudioShow(params.id).then((res) => {
      if (!res.success) {
        toast.error("Reihe nicht gefunden", { description: res.error })
        router.push("/admin/dashboard/hoeren")
        return
      }
      const s = res.data.show
      setForm({
        kind: s.kind,
        title: s.title,
        author: s.author ?? "",
        description: s.description ?? "",
        cover_url: s.cover_url ?? "",
        accent_color: s.accent_color ?? "",
        language: s.language,
        status: s.status,
        sort_order: s.sort_order,
      })
      setEpisodes(res.data.episodes)
      setLoading(false)
    })
  }, [isNew, params.id, router])

  const set = <K extends keyof AudioShowInput>(key: K, value: AudioShowInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onCover = useCallback(async (url: string) => {
    setForm((f) => ({ ...f, cover_url: url }))
    if (!url) return
    const accent = await extractAccentColor(url)
    if (accent) setForm((f) => ({ ...f, accent_color: accent }))
  }, [])

  const save = async (status?: AudioStatus) => {
    setSaving(true)
    const res = await saveAudioShow(isNew ? null : params.id, { ...form, status: status ?? form.status })
    setSaving(false)
    if (!res.success) {
      toast.error("Speichern fehlgeschlagen", { description: res.error })
      return
    }
    if (status) set("status", status)
    toast.success("Reihe gespeichert")
    if (isNew) router.replace(`/admin/dashboard/hoeren/${res.data.id}`)
  }

  const remove = async () => {
    if (!confirm(`„${form.title}“ und alle Folgen löschen? Das lässt sich nicht rückgängig machen.`)) return
    const res = await deleteAudioShow(params.id)
    if (!res.success) {
      toast.error("Löschen fehlgeschlagen", { description: res.error })
      return
    }
    toast.success("Reihe gelöscht")
    router.push("/admin/dashboard/hoeren")
  }

  if (loading) {
    return <div className="mx-auto h-96 max-w-5xl animate-pulse rounded-[10px] bg-muted" />
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin/dashboard/hoeren")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">{isNew ? "Neue Reihe" : form.title || "Reihe"}</h1>
          <p className="mt-1 text-muted-foreground">
            Eine Reihe bündelt Folgen: eine Kurzgeschichten-Sammlung, ein Hörbuch (Kapitel) oder einen Podcast.
          </p>
        </div>
        {!isNew && (
          <Badge variant={form.status === "published" ? "default" : "secondary"}>{STATUS_LABEL[form.status]}</Badge>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <Label>Cover (quadratisch)</Label>
          <MediaUpload kind="cover" value={form.cover_url} onChange={(url) => void onCover(url)} />
          <div>
            <Label htmlFor="accent">Player-Farbe</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="accent"
                type="color"
                value={form.accent_color || "#2a1d15"}
                onChange={(e) => set("accent_color", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
              />
              <Input value={form.accent_color} onChange={(e) => set("accent_color", e.target.value)} placeholder="#2a1d15" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Wird aus dem Cover übernommen; dunkel halten.</p>
          </div>
        </div>

        <div className="space-y-5 rounded-[10px] border border-border bg-card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Art</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v as AudioKind)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as AudioKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sprache</Label>
              <Select value={form.language} onValueChange={(v) => set("language", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="nds">Plattdeutsch</SelectItem>
                  <SelectItem value="en">Englisch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="author">Autor:in / Sprecher:in</Label>
            <Input id="author" value={form.author} onChange={(e) => set("author", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              rows={4}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="w-40">
            <Label htmlFor="sort">Reihenfolge</Label>
            <Input
              id="sort"
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value))}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Kleiner = weiter vorne</p>
          </div>
        </div>
      </div>

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
          {!isNew && form.status !== "published" && (
            <Button onClick={() => save("published")} disabled={saving || !form.title}>
              Veröffentlichen
            </Button>
          )}
          {!isNew && form.status === "published" && (
            <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
              Zurückziehen
            </Button>
          )}
        </div>
      </div>

      {!isNew && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-foreground">Folgen</h2>
            <Button asChild variant="outline">
              <Link href={`/admin/dashboard/hoeren/${params.id}/folge/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Neue Folge
              </Link>
            </Button>
          </div>
          {form.status !== "published" && (
            <p className="text-sm text-muted-foreground">
              Die App zeigt die Reihe erst, wenn die Reihe und mindestens eine Folge veröffentlicht sind.
            </p>
          )}
          {episodes.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Noch keine Folge.
            </p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-[10px] border border-border bg-card">
              {episodes.map((ep) => (
                <Link
                  key={ep.id}
                  href={`/admin/dashboard/hoeren/${params.id}/folge/${ep.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-accent"
                >
                  <span className="w-8 text-center text-sm text-muted-foreground">{ep.episode_number ?? "–"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{ep.title}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      {formatDuration(ep.duration_seconds)}
                      {ep.transcript.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          · <FileText className="h-3 w-3" /> {ep.transcript.length} Textabschnitte
                        </span>
                      )}
                    </p>
                  </div>
                  <Badge variant={ep.status === "published" ? "default" : "secondary"}>{STATUS_LABEL[ep.status]}</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
