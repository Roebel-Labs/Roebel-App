"use client"

// "Vorlesen" on the web: asks the server for the article's recording (rendered once,
// then cached) and plays it. The request is a POST so crawlers never trigger a render.
import { useRef, useState } from "react"
import { Headphones, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type State = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; url: string } | { kind: "error"; message: string }

export function ListenButton({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: "idle" })
  const audioRef = useRef<HTMLAudioElement>(null)

  async function load() {
    setState({ kind: "loading" })
    try {
      const res = await fetch(`/api/news/${encodeURIComponent(slug)}/audio`, { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        setState({ kind: "error", message: json.error ?? "Vorlesen ist gerade nicht verfügbar" })
        return
      }
      setState({ kind: "ready", url: json.url })
    } catch {
      setState({ kind: "error", message: "Vorlesen ist gerade nicht verfügbar" })
    }
  }

  if (state.kind === "ready") {
    return (
      <audio
        ref={audioRef}
        src={state.url}
        controls
        autoPlay
        preload="auto"
        className="h-10 w-full max-w-md"
        aria-label="Artikel anhören"
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={load}
        disabled={state.kind === "loading"}
        className="h-9 text-sm"
      >
        {state.kind === "loading" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Headphones className="mr-2 h-4 w-4" />
        )}
        {state.kind === "loading" ? "Wird vorbereitet…" : "Vorlesen"}
      </Button>
      {state.kind === "loading" && (
        <span className="text-xs text-muted-foreground">Beim ersten Mal dauert das einen Moment.</span>
      )}
      {state.kind === "error" && <span className="text-xs text-red-600">{state.message}</span>}
    </div>
  )
}
