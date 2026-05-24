"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Music, Upload, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface AudioUploadDropzoneProps {
  onUploadComplete: (url: string) => void
  currentAudioUrl?: string
  bucketName?: string
  folder?: string
  maxSizeMB?: number
}

const ACCEPTED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
]

export function AudioUploadDropzone({
  onUploadComplete,
  currentAudioUrl = "",
  bucketName = "story-audio",
  folder = "",
  maxSizeMB = 10,
}: AudioUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string>(currentAudioUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setAudioUrl(currentAudioUrl)
  }, [currentAudioUrl])

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("audio/") && !ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Bitte eine Audiodatei (MP3, M4A, AAC, OGG) auswählen")
        return
      }
      const maxSize = maxSizeMB * 1024 * 1024
      if (file.size > maxSize) {
        toast.error(`Audio muss kleiner als ${maxSizeMB} MB sein`)
        return
      }

      setIsUploading(true)
      const loadingToast = toast.loading("Audio wird hochgeladen...")

      try {
        const supabase = createClient()
        const fileExt = file.name.split(".").pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const cleanFolder = folder.replace(/^\/+|\/+$/g, "")
        const filePath = cleanFolder ? `${cleanFolder}/${fileName}` : fileName

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          })
        if (uploadError) throw uploadError

        const {
          data: { publicUrl },
        } = supabase.storage.from(bucketName).getPublicUrl(filePath)

        toast.success("Audio hochgeladen", { id: loadingToast })
        onUploadComplete(publicUrl)
        setAudioUrl(publicUrl)
      } catch (error) {
        console.error("Audio upload error:", error)
        toast.error("Fehler beim Hochladen", {
          id: loadingToast,
          description:
            error instanceof Error ? error.message : "Unbekannter Fehler",
        })
        setAudioUrl(currentAudioUrl)
      } finally {
        setIsUploading(false)
      }
    },
    [bucketName, folder, currentAudioUrl, maxSizeMB, onUploadComplete],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) uploadFile(file)
    },
    [uploadFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  const handleRemove = () => {
    setAudioUrl("")
    onUploadComplete("")
    if (fileInputRef.current) fileInputRef.current.value = ""
    toast.success("Audio entfernt")
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {audioUrl ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
            <Music className="h-5 w-5 text-primary" />
          </div>
          <audio src={audioUrl} controls className="flex-1 min-w-0" />
          <button
            type="button"
            onClick={handleRemove}
            disabled={isUploading}
            className="flex-shrink-0 rounded-full p-2 hover:bg-accent"
            aria-label="Audio entfernen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-[10px] p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-gray-400 hover:bg-accent"
          } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="flex flex-col items-center gap-3">
            {isUploading ? (
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="text-base font-medium text-foreground mb-0.5">
                {isUploading ? "Wird hochgeladen..." : "Audio hochladen"}
              </p>
              <p className="text-xs text-muted-foreground">
                MP3, M4A, AAC oder OGG bis zu {maxSizeMB} MB
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
