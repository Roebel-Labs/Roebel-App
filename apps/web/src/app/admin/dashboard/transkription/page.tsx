"use client"

import { useCallback, useRef, useState } from "react"
import { AudioLines, Check, Copy, Download, Loader2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { createTranscriptionUploadTarget } from "@/app/actions/transcription"

const BUCKET = "admin-transcriptions"
const MAX_MB = 25
const ACCEPTED_EXTENSIONS = ["mp3", "m4a", "mp4", "aac", "wav", "webm", "ogg", "flac"]

type Status = "idle" | "uploading" | "transcribing" | "done"

const STATUS_LABEL: Record<Status, string> = {
  idle: "",
  uploading: "Datei wird hochgeladen…",
  transcribing: "Wird transkribiert… (bei 5 Minuten Audio ca. 20–60 Sekunden)",
  done: "",
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function TranscriptionPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [language, setLanguage] = useState("de")
  const [format, setFormat] = useState<"text" | "srt">("text")
  const [prompt, setPrompt] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState("")
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = status === "uploading" || status === "transcribing"

  const pickFile = useCallback((f: File | undefined) => {
    if (!f) return
    const ext = f.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      toast.error("Bitte eine Audiodatei auswählen (MP3, M4A, WAV, OGG, FLAC, WEBM)")
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`Die Datei ist größer als ${MAX_MB} MB`)
      return
    }
    setFile(f)
    setResult("")
    setStatus("idle")
  }, [])

  const transcribe = async () => {
    if (!file) return
    setResult("")
    try {
      setStatus("uploading")
      const target = await createTranscriptionUploadTarget(file.name)
      if (!target.success) throw new Error(target.error)

      const { error: uploadError } = await createClient()
        .storage.from(BUCKET)
        .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || "audio/mpeg" })
      if (uploadError) throw new Error(uploadError.message)

      setStatus("transcribing")
      const res = await fetch("/api/transcription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: target.path,
          language: language === "auto" ? undefined : language,
          format,
          prompt,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string; detail?: string }
      if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(": ") || `HTTP ${res.status}`)

      setResult(data.text ?? "")
      setStatus("done")
      toast.success("Transkription fertig")
    } catch (err) {
      setStatus("idle")
      toast.error("Transkription fehlgeschlagen", {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const base = file?.name.replace(/\.[^.]+$/, "") || "transkription"
    const ext = format === "srt" ? "srt" : "txt"
    const url = URL.createObjectURL(new Blob([result], { type: "text/plain;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${base}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-medium text-foreground">Transkription</h1>
        <p className="mt-1 text-muted-foreground">
          Audiodatei hochladen und mit OpenAI in Text umwandeln. Die Datei wird nach der Verarbeitung gelöscht.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Audiodatei</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="flex min-w-0 items-center gap-3">
                <AudioLines className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => {
                  setFile(null)
                  setResult("")
                  setStatus("idle")
                }}
                aria-label="Datei entfernen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                pickFile(e.dataTransfer.files?.[0])
              }}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-10 text-center transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              }`}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Datei hierher ziehen oder klicken</span>
              <span className="text-xs text-muted-foreground">MP3, M4A, WAV, OGG, FLAC, WEBM · max. {MAX_MB} MB</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.webm"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ""
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Sprache</Label>
              <Select value={language} onValueChange={setLanguage} disabled={busy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">Englisch</SelectItem>
                  <SelectItem value="auto">Automatisch erkennen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ausgabe</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as "text" | "srt")} disabled={busy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Fließtext (beste Qualität)</SelectItem>
                  <SelectItem value="srt">Mit Zeitstempeln (SRT-Untertitel)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transcription-prompt">Fachbegriffe & Namen (optional)</Label>
            <Input
              id="transcription-prompt"
              placeholder="z. B. Röbel, Müritz, Mecky, Bürgerrat"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">Hilft der KI, Eigennamen richtig zu schreiben.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={transcribe} disabled={!file || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transkribieren
            </Button>
            {busy && <span className="text-sm text-muted-foreground">{STATUS_LABEL[status]}</span>}
          </div>
        </CardContent>
      </Card>

      {status === "done" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg font-medium">Ergebnis</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copy} disabled={!result}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Kopiert" : "Kopieren"}
              </Button>
              <Button variant="outline" size="sm" onClick={download} disabled={!result}>
                <Download className="mr-2 h-4 w-4" />
                .{format === "srt" ? "srt" : "txt"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              rows={18}
              className="font-mono text-sm leading-relaxed"
              placeholder="Kein Text erkannt."
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
