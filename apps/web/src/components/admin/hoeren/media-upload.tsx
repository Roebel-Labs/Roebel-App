"use client"

import { useCallback, useRef, useState } from "react"
import { AudioLines, ImageIcon, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { createAudioUploadTarget } from "@/app/actions/audio-content"

type Kind = "audio" | "cover"

const LIMITS: Record<Kind, { mb: number; accept: string; label: string }> = {
  audio: { mb: 500, accept: "audio/*", label: "MP3, M4A, AAC, WAV oder OGG bis 500 MB" },
  cover: { mb: 10, accept: "image/jpeg,image/png,image/webp", label: "JPG, PNG oder WEBP, quadratisch, bis 10 MB" },
}

/**
 * PUTs the file straight to the signed Storage URL with XHR so the admin sees
 * real upload progress (supabase-js' uploadToSignedUrl has none).
 */
function putWithProgress(url: string, file: File, onProgress: (ratio: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.setRequestHeader("x-upsert", "false")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Hochladen"))
    xhr.send(file)
  })
}

export async function uploadAudioContentFile(
  file: File,
  kind: Kind,
  onProgress: (ratio: number) => void = () => {},
): Promise<string> {
  const target = await createAudioUploadTarget(file.name, kind === "audio" ? "audio" : "covers")
  if (!target.success) throw new Error(target.error)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const url = `${base}/storage/v1/object/upload/sign/audio-content/${target.data.path}?token=${encodeURIComponent(target.data.token)}`
  await putWithProgress(url, file, onProgress)
  return target.data.publicUrl
}

/** Reads the audio length in the browser so the app can show "36 Min." before playback starts. */
export function readAudioDuration(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio()
    audio.preload = "metadata"
    audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.onerror = () => resolve(null)
    audio.src = src
  })
}

/**
 * Average colour of the cover, darkened so white text stays readable on it —
 * the same idea as the brown player background in Brink / Spotify.
 */
export function extractAccentColor(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let r = 0
        let g = 0
        let b = 0
        let weight = 0
        for (let i = 0; i < data.length; i += 4) {
          const max = Math.max(data[i], data[i + 1], data[i + 2])
          const min = Math.min(data[i], data[i + 1], data[i + 2])
          // Saturated pixels count more, so a beige background doesn't win over the brand colour.
          const w = 1 + (max - min) / 32
          r += data[i] * w
          g += data[i + 1] * w
          b += data[i + 2] * w
          weight += w
        }
        // Darken to ~35 % so it works as a dark backdrop for white text.
        const f = 0.35 / weight
        const hex = [r * f, g * f, b * f].map((v) => Math.round(Math.min(255, v)).toString(16).padStart(2, "0")).join("")
        resolve(`#${hex}`)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export function MediaUpload({
  kind,
  value,
  onChange,
}: {
  kind: Kind
  value: string
  onChange: (url: string, file?: File) => void
}) {
  const [progress, setProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const limit = LIMITS[kind]

  const upload = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      const ok = kind === "audio" ? file.type.startsWith("audio/") : file.type.startsWith("image/")
      if (!ok) {
        toast.error(kind === "audio" ? "Bitte eine Audiodatei wählen" : "Bitte ein Bild wählen")
        return
      }
      if (file.size > limit.mb * 1024 * 1024) {
        toast.error(`Die Datei ist größer als ${limit.mb} MB`)
        return
      }
      setProgress(0)
      try {
        const url = await uploadAudioContentFile(file, kind, setProgress)
        onChange(url, file)
        toast.success(kind === "audio" ? "Audio hochgeladen" : "Cover hochgeladen")
      } catch (error) {
        toast.error("Upload fehlgeschlagen", { description: error instanceof Error ? error.message : String(error) })
      } finally {
        setProgress(null)
        if (inputRef.current) inputRef.current.value = ""
      }
    },
    [kind, limit.mb, onChange],
  )

  const uploading = progress !== null

  if (value && !uploading) {
    return kind === "cover" ? (
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Cover" className="h-40 w-40 rounded-[10px] border border-border object-cover" />
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-full p-2 hover:bg-accent"
          aria-label="Cover entfernen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3">
        <AudioLines className="h-5 w-5 shrink-0 text-muted-foreground" />
        <audio src={value} controls className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-full p-2 hover:bg-accent"
          aria-label="Audio entfernen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!uploading) void upload(e.dataTransfer.files[0])
      }}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`cursor-pointer rounded-[10px] border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
      } ${uploading ? "cursor-default" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={limit.accept}
        className="hidden"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {kind === "audio" ? (
            <Upload className="h-6 w-6 text-muted-foreground" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        {uploading ? (
          <div className="w-full max-w-xs space-y-2">
            <p className="text-sm font-medium text-foreground">Wird hochgeladen… {Math.round((progress ?? 0) * 100)} %</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${(progress ?? 0) * 100}%` }} />
            </div>
          </div>
        ) : (
          <div>
            <p className="text-base font-medium text-foreground">
              {kind === "audio" ? "Audiodatei hochladen" : "Cover hochladen"}
            </p>
            <p className="text-xs text-muted-foreground">{limit.label}</p>
          </div>
        )}
      </div>
    </div>
  )
}
