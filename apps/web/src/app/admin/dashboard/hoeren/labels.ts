import type { AudioKind, AudioStatus } from "@/app/actions/audio-content"

export const KIND_LABEL: Record<AudioKind, string> = {
  short_story: "Kurzgeschichte",
  audiobook: "Hörbuch",
  podcast: "Podcast",
}

export const STATUS_LABEL: Record<AudioStatus, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  archived: "Archiviert",
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "–"
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`
}
