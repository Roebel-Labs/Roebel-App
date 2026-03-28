"use client"

import { useState } from "react"
import Image from "next/image"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

interface BusinessGalleryProps {
  images: string[]
  businessName: string
}

export function BusinessGallery({ images, businessName }: BusinessGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (!images || images.length === 0) return null

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-semibold text-foreground mb-3">Galerie</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {images.map((src, index) => (
            <button
              key={index}
              onClick={() => setLightboxIndex(index)}
              className="relative aspect-square rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-cover blur-xl scale-110"
                aria-hidden="true"
              />
              <Image
                src={src}
                alt={`${businessName} Bild ${index + 1}`}
                fill
                className="object-contain relative z-10"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white hover:text-muted-foreground z-10"
          >
            <X className="h-8 w-8" />
          </button>

          {lightboxIndex > 0 && (
            <button
              onClick={() => setLightboxIndex(lightboxIndex - 1)}
              className="absolute left-4 text-white hover:text-muted-foreground z-10"
            >
              <ChevronLeft className="h-10 w-10" />
            </button>
          )}

          {lightboxIndex < images.length - 1 && (
            <button
              onClick={() => setLightboxIndex(lightboxIndex + 1)}
              className="absolute right-4 text-white hover:text-muted-foreground z-10"
            >
              <ChevronRight className="h-10 w-10" />
            </button>
          )}

          <div className="relative w-full max-w-4xl max-h-[80vh] mx-4">
            <Image
              src={images[lightboxIndex]}
              alt={`${businessName} Bild ${lightboxIndex + 1}`}
              width={1200}
              height={800}
              className="object-contain w-full h-full max-h-[80vh]"
            />
          </div>
        </div>
      )}
    </>
  )
}
