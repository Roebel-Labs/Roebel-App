"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Headphones, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { listAudioShows, type AudioShowWithCount } from "@/app/actions/audio-content"
import { KIND_LABEL, STATUS_LABEL } from "./labels"

export default function HoerenPage() {
  const [shows, setShows] = useState<AudioShowWithCount[] | null>(null)

  useEffect(() => {
    listAudioShows().then((res) => {
      if (res.success) setShows(res.data)
      else {
        toast.error("Reihen konnten nicht geladen werden", { description: res.error })
        setShows([])
      }
    })
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium text-foreground">Hören</h1>
          <p className="mt-1 text-muted-foreground">
            Kurzgeschichten, Hörbücher und Podcasts mit mitlaufendem Text für den Erkunden-Bereich der App.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/dashboard/hoeren/new">
            <Plus className="mr-2 h-4 w-4" />
            Neue Reihe
          </Link>
        </Button>
      </div>

      {shows === null ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-[10px] bg-muted" />
          ))}
        </div>
      ) : shows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-border p-12 text-center">
          <Headphones className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">Noch keine Reihe</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Lege zuerst eine Reihe an (z. B. die Kurzgeschichten-Sammlung) und füge dann die erste Folge mit Audio und
            Text hinzu.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {shows.map((show) => (
            <Link key={show.id} href={`/admin/dashboard/hoeren/${show.id}`} className="group space-y-2">
              <div
                className="aspect-square overflow-hidden rounded-[10px] border border-border"
                style={{ backgroundColor: show.accent_color ?? undefined }}
              >
                {show.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={show.cover_url}
                    alt=""
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-muted">
                    <Headphones className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div>
                <p className="truncate font-medium text-foreground">{show.title}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[show.kind]} · {show.episode_count} {show.episode_count === 1 ? "Folge" : "Folgen"}
                </p>
              </div>
              <Badge variant={show.status === "published" ? "default" : "secondary"}>{STATUS_LABEL[show.status]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
