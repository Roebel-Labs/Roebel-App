"use client"

import { useEffect, useState } from "react"
import { Music } from "lucide-react"
import { toast } from "sonner"
import { AudioUploadDropzone } from "@/components/ui/audio-upload-dropzone"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getEventStoriesAudioUrl,
  setEventStoriesAudioUrl,
} from "@/app/actions/app-settings"

/**
 * Manages the single shared background audio track that plays under ALL
 * event stories in the mobile app. When an individual event has its own
 * audio uploaded, the app ducks this track out and fades the event's track
 * in, then fades this one back in afterwards.
 */
export function EventStoryAudioPanel() {
  const [audioUrl, setAudioUrl] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEventStoriesAudioUrl()
      .then((url) => setAudioUrl(url ?? ""))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = async (url: string) => {
    const next = url || null
    setAudioUrl(url)
    const result = await setEventStoriesAudioUrl(next)
    if (!result.success) {
      toast.error("Fehler beim Speichern", { description: result.error })
      return
    }
    toast.success(
      next ? "Hintergrund-Audio gespeichert" : "Hintergrund-Audio entfernt",
    )
  }

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Music className="h-4 w-4 text-primary" />
        <h2 className="text-base font-medium">
          Hintergrund-Audio für alle Event-Stories
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Dieser Track läuft als gemeinsame Hintergrundmusik unter allen
        Event-Stories. Hat ein einzelnes Event ein eigenes Audio, wird dieser
        Track kurz ausgeblendet und danach wieder eingeblendet.
      </p>
      {loading ? (
        <Skeleton className="h-[68px] w-full rounded-[10px]" />
      ) : (
        <AudioUploadDropzone
          bucketName="story-audio"
          folder="global"
          currentAudioUrl={audioUrl}
          onUploadComplete={handleChange}
          maxSizeMB={10}
        />
      )}
    </div>
  )
}
