"use client";

import { useRef, useEffect, useState } from "react";
import { Play } from "lucide-react";

interface VideoPlayerProps {
  url: string;
  onFullscreen?: () => void;
}

export function VideoPlayer({ url, onFullscreen }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Intersection Observer for autoplay
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {
            // Autoplay blocked, that's fine
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const handleClick = () => {
    if (!hasInteracted) {
      setHasInteracted(true);
      const video = videoRef.current;
      if (video) {
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
      return;
    }

    if (onFullscreen) {
      onFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full max-h-[75vw] sm:max-h-[400px] overflow-hidden bg-black cursor-pointer"
      onClick={handleClick}
    >
      <video
        ref={videoRef}
        src={url}
        className="w-full h-full object-contain"
        muted
        loop
        playsInline
        controls={hasInteracted}
        preload="metadata"
        onPlay={handlePlay}
        onPause={handlePause}
        onClick={(e) => {
          // Prevent double handling when controls are visible
          if (hasInteracted) e.stopPropagation();
        }}
      />
      {!isPlaying && !hasInteracted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="h-14 w-14 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="h-7 w-7 text-white ml-1" fill="white" />
          </div>
        </div>
      )}
    </div>
  );
}
