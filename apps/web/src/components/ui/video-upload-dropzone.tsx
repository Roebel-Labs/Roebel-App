"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Film, Upload, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface VideoUploadDropzoneProps {
  onUploadComplete: (url: string) => void
  currentVideoUrl?: string
  bucketName?: string
  folder?: string
  maxSizeMB?: number
}

const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/quicktime"]

export function VideoUploadDropzone({
  onUploadComplete,
  currentVideoUrl = "",
  bucketName = "story-videos",
  folder = "",
  maxSizeMB = 50,
}: VideoUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string>(currentVideoUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setVideoUrl(currentVideoUrl)
  }, [currentVideoUrl])

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/") && !ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Bitte eine Videodatei (MP4, WebM, MOV) auswählen")
        return
      }
      const maxSize = maxSizeMB * 1024 * 1024
      if (file.size > maxSize) {
        toast.error(`Video muss kleiner als ${maxSizeMB} MB sein`)
        return
      }

      setIsUploading(true)
      const loadingToast = toast.loading("Video wird hochgeladen...")

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

        toast.success("Video hochgeladen", { id: loadingToast })
        onUploadComplete(publicUrl)
        setVideoUrl(publicUrl)
      } catch (error) {
        console.error("Video upload error:", error)
        toast.error("Fehler beim Hochladen", {
          id: loadingToast,
          description:
            error instanceof Error ? error.message : "Unbekannter Fehler",
        })
        setVideoUrl(currentVideoUrl)
      } finally {
        setIsUploading(false)
      }
    },
    [bucketName, folder, currentVideoUrl, maxSizeMB, onUploadComplete],
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
    setVideoUrl("")
    onUploadComplete("")
    if (fileInputRef.current) fileInputRef.current.value = ""
    toast.success("Video entfernt")
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {videoUrl ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <video
            src={videoUrl}
            controls
            className="flex-1 min-w-0 max-h-40 rounded-md bg-black"
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={isUploading}
            className="flex-shrink-0 rounded-full p-2 hover:bg-accent"
            aria-label="Video entfernen"
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
                {isUploading ? "Wird hochgeladen..." : "Video hochladen"}
              </p>
              <p className="text-xs text-muted-foreground">
                MP4, WebM oder MOV bis zu {maxSizeMB} MB
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
