"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface VideoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
}

function getYouTubeVideoId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[7].length === 11 ? match[7] : null;
}

export function VideoOverlay({ isOpen, onClose, videoUrl }: VideoOverlayProps) {
  // Body scroll lock + keyboard
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "unset";
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const videoId = getYouTubeVideoId(videoUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 md:p-8 lg:p-16"
      onClick={onClose}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-30 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 md:right-8 md:top-8"
        aria-label="Video schliessen"
      >
        <X className="h-6 w-6 md:h-8 md:w-8" />
      </button>

      {/* Video Container */}
      <div
        className="relative w-full max-w-7xl aspect-video"
        onClick={(e) => e.stopPropagation()}
      >
        {videoId ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            className="h-full w-full rounded-lg"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full items-center justify-center text-white">
            Invalid YouTube URL
          </div>
        )}
      </div>
    </div>
  );
}
