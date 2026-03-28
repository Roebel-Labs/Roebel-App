"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, X, Video, ImagePlus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"

interface MediaUploaderProps {
  mediaUrls: string[]
  videoUrl: string | null
  onMediaChange: (urls: string[]) => void
  onVideoChange: (url: string | null) => void
  maxImages?: number
  maxSizeMB?: number
  pathPrefix?: string
  hideVideo?: boolean
}

export function MediaUploader({
  mediaUrls,
  videoUrl,
  onMediaChange,
  onVideoChange,
  maxImages = 5,
  maxSizeMB = 5,
  pathPrefix = "deal-media/",
  hideVideo = false,
}: MediaUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return
    if (file.size > maxSizeMB * 1024 * 1024) return

    setIsUploading(true)
    try {
      const supabase = createClient()
      const fileExt = file.name.split(".").pop()
      const fileName = `${pathPrefix}${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, file, { cacheControl: "3600", upsert: false })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from("images").getPublicUrl(fileName)
      onMediaChange([...mediaUrls, publicUrl])
    } catch (err) {
      console.error("Upload error:", err)
    } finally {
      setIsUploading(false)
    }
  }, [mediaUrls, maxSizeMB, onMediaChange, pathPrefix])

  const handleFiles = useCallback((files: FileList) => {
    const remaining = maxImages - mediaUrls.length
    const toUpload = Array.from(files).slice(0, remaining)
    toUpload.forEach((file) => uploadFile(file))
  }, [maxImages, mediaUrls.length, uploadFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const removeImage = (index: number) => {
    onMediaChange(mediaUrls.filter((_, i) => i !== index))
  }

  const canAddMore = mediaUrls.length < maxImages

  return (
    <div className="space-y-4">
      {/* Images section */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Bilder ({mediaUrls.length}/{maxImages})
        </label>

        {/* Thumbnails grid */}
        {mediaUrls.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
            {mediaUrls.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                <Image src={url} alt={`Bild ${i + 1}`} fill className="object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 text-[10px] font-medium bg-black/60 text-white px-1.5 py-0.5 rounded">
                    Titelbild
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload zone */}
        {canAddMore && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              isDragging ? "border-blue-400 bg-blue-50" : "border-border hover:border-border"
            } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files)
                e.target.value = ""
              }}
            />
            <div className="flex flex-col items-center gap-1.5">
              {isUploading ? (
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
              )}
              <p className="text-xs text-muted-foreground">
                {isUploading ? "Wird hochgeladen..." : "Bilder hierher ziehen oder klicken"}
              </p>
              <p className="text-[10px] text-muted-foreground">JPG, PNG, GIF bis {maxSizeMB}MB</p>
            </div>
          </div>
        )}
      </div>

      {/* Video URL section */}
      {!hideVideo && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Video (optional)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 flex-1 px-3 py-2 border border-border rounded-lg">
              <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                type="url"
                value={videoUrl || ""}
                onChange={(e) => onVideoChange(e.target.value || null)}
                placeholder="YouTube oder Vimeo URL"
                className="w-full text-sm focus:outline-none bg-transparent"
              />
            </div>
            {videoUrl && (
              <button
                type="button"
                onClick={() => onVideoChange(null)}
                className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">z.B. https://youtube.com/watch?v=...</p>
        </div>
      )}
    </div>
  )
}
