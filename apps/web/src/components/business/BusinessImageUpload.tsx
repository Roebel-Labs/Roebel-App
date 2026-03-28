"use client"

import { useRef } from "react"
import Image from "next/image"
import { Upload, X } from "lucide-react"

interface BusinessImageUploadProps {
  label: string
  currentUrl: string | null
  onFileSelect: (file: File | null) => void
  previewUrl: string | null
  accept?: string
}

export function BusinessImageUpload({
  label,
  currentUrl,
  onFileSelect,
  previewUrl,
  accept = "image/*",
}: BusinessImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const displayUrl = previewUrl || currentUrl

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
  }

  const handleRemove = () => {
    onFileSelect(null)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {displayUrl ? (
        <div className="relative w-full h-40 rounded-lg overflow-hidden bg-muted border border-border">
          <Image
            src={displayUrl}
            alt={label}
            fill
            className="object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 p-1 bg-card/90 rounded-full hover:bg-card transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-40 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-border hover:text-muted-foreground transition-colors"
        >
          <Upload className="h-8 w-8" />
          <span className="text-sm">Bild hochladen</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
