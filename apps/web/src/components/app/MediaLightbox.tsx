"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useHlsVideo, isHlsUrl } from "@/hooks/useHlsVideo";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface MediaLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaUrls: string[];
  videoUrl?: string | null;
  initialIndex?: number;
  mode: "image" | "video";
}

export function MediaLightbox({
  open,
  onOpenChange,
  mediaUrls,
  videoUrl,
  initialIndex = 0,
  mode,
}: MediaLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const lightboxVideoRef = useRef<HTMLVideoElement>(null);
  useHlsVideo(lightboxVideoRef, videoUrl ?? "");

  useEffect(() => {
    if (open) setCurrentIndex(initialIndex);
  }, [open, initialIndex]);

  const goNext = useCallback(() => {
    if (mode === "image" && mediaUrls.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % mediaUrls.length);
    }
  }, [mode, mediaUrls.length]);

  const goPrev = useCallback(() => {
    if (mode === "image" && mediaUrls.length > 1) {
      setCurrentIndex((prev) => (prev - 1 + mediaUrls.length) % mediaUrls.length);
    }
  }, [mode, mediaUrls.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, goNext, goPrev]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/95" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center outline-none"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {/* Hidden title for accessibility */}
          <DialogPrimitive.Title className="sr-only">
            {mode === "video" ? "Video" : `Bild ${currentIndex + 1} von ${mediaUrls.length}`}
          </DialogPrimitive.Title>

          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            aria-label="Schließen"
          >
            <X className="h-6 w-6" />
          </button>

          {mode === "video" && videoUrl ? (
            <div className="w-full max-w-4xl px-4">
              <video
                ref={lightboxVideoRef}
                src={isHlsUrl(videoUrl) ? undefined : videoUrl}
                className="w-full max-h-[85vh] object-contain"
                controls
                autoPlay
                playsInline
              />
            </div>
          ) : (
            <>
              {/* Image counter */}
              {mediaUrls.length > 1 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-black/50 text-white text-sm">
                  {currentIndex + 1} / {mediaUrls.length}
                </div>
              )}

              {/* Previous button */}
              {mediaUrls.length > 1 && (
                <button
                  onClick={goPrev}
                  className="absolute left-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  aria-label="Vorheriges Bild"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              {/* Image */}
              <div className="relative w-full h-full max-w-4xl max-h-[85vh] mx-4">
                {mediaUrls[currentIndex] && (
                  <Image
                    src={mediaUrls[currentIndex]}
                    alt={`Bild ${currentIndex + 1}`}
                    fill
                    className="object-contain"
                    sizes="100vw"
                    priority
                  />
                )}
              </div>

              {/* Next button */}
              {mediaUrls.length > 1 && (
                <button
                  onClick={goNext}
                  className="absolute right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  aria-label="Nächstes Bild"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
