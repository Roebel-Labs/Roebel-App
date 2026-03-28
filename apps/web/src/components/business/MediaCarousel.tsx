"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Play } from "lucide-react"

interface MediaCarouselProps {
  images: string[]
  videoUrl?: string | null
  alt: string
  height?: string
  showIndicators?: boolean
  className?: string
  overlay?: React.ReactNode
}

function getVideoEmbedUrl(url: string): string | null {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`

  return null
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url)
}

export function MediaCarousel({
  images,
  videoUrl,
  alt,
  height = "h-36",
  showIndicators = true,
  className = "",
  overlay,
}: MediaCarouselProps) {
  const hasVideo = !!videoUrl
  const totalSlides = images.length + (hasVideo ? 1 : 0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showVideo, setShowVideo] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollTo = useCallback((index: number) => {
    if (!scrollRef.current) return
    const slideWidth = scrollRef.current.offsetWidth
    scrollRef.current.scrollTo({ left: slideWidth * index, behavior: "smooth" })
    setActiveIndex(index)
  }, [])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const slideWidth = scrollRef.current.offsetWidth
    const scrollLeft = scrollRef.current.scrollLeft
    const newIndex = Math.round(scrollLeft / slideWidth)
    setActiveIndex(newIndex)
  }, [])

  // No media at all
  if (totalSlides === 0) return null

  // Single image, no carousel UI
  if (totalSlides === 1 && !hasVideo) {
    return (
      <div className={`relative ${height} overflow-hidden ${className}`}>
        <Image src={images[0]} alt="" fill className="object-cover blur-xl scale-110" aria-hidden="true" />
        <Image src={images[0]} alt={alt} fill className="object-contain relative z-10" />
        {overlay}
      </div>
    )
  }

  return (
    <div className={`relative ${height} bg-muted group ${className}`}>
      {/* Slides container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide w-full h-full"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {images.map((url, i) => (
          <div key={i} className="snap-start flex-shrink-0 w-full h-full relative overflow-hidden">
            <Image src={url} alt="" fill className="object-cover blur-xl scale-110" aria-hidden="true" />
            <Image src={url} alt={`${alt} ${i + 1}`} fill className="object-contain relative z-10" />
          </div>
        ))}

        {/* Video slide */}
        {hasVideo && (
          <div className="snap-start flex-shrink-0 w-full h-full relative bg-black flex items-center justify-center">
            {showVideo ? (
              (() => {
                const embedUrl = getVideoEmbedUrl(videoUrl!)
                if (embedUrl) {
                  return (
                    <iframe
                      src={embedUrl}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )
                }
                if (isDirectVideo(videoUrl!)) {
                  return <video src={videoUrl!} controls className="w-full h-full object-contain" />
                }
                return <p className="text-white text-sm">Video nicht verfügbar</p>
              })()
            ) : (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowVideo(true) }}
                className="flex flex-col items-center gap-2 text-white"
              >
                <div className="w-12 h-12 rounded-full bg-card/20 backdrop-blur flex items-center justify-center">
                  <Play className="h-6 w-6 fill-white" />
                </div>
                <span className="text-xs font-medium">Video abspielen</span>
              </button>
            )}
          </div>
        )}
      </div>

      {overlay}

      {/* Navigation arrows (desktop hover) */}
      {totalSlides > 1 && (
        <>
          {activeIndex > 0 && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollTo(activeIndex - 1) }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-card/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
            >
              <ChevronLeft className="h-4 w-4 text-foreground" />
            </button>
          )}
          {activeIndex < totalSlides - 1 && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollTo(activeIndex + 1) }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-card/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
            >
              <ChevronRight className="h-4 w-4 text-foreground" />
            </button>
          )}
        </>
      )}

      {/* Dot indicators */}
      {showIndicators && totalSlides > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollTo(i) }}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === activeIndex ? "bg-card" : "bg-card/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
