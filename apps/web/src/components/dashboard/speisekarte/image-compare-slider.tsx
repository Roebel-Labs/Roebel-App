"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";

interface ImageCompareSliderProps {
  /** Current/committed image — shown on the right. */
  oldUrl: string;
  /** Newly generated image — shown on the left, revealed by dragging right. */
  newUrl: string;
  /** Tailwind aspect class of the stage (default 16:9; mini-app icons use aspect-square). */
  aspectClass?: string;
}

/**
 * Before/after slider with a draggable vertical divider. The new image sits on
 * top, clipped to the left of the divider; drag left to reveal more of the old
 * (current) image, drag right to reveal more of the new one. Works with mouse
 * and touch via pointer events.
 */
export function ImageCompareSlider({
  oldUrl,
  newUrl,
  aspectClass = "aspect-[16/9]",
}: ImageCompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, pct)));
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${aspectClass} rounded-md overflow-hidden border border-border bg-muted select-none touch-none`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging) updateFromClientX(e.clientX);
      }}
      onPointerUp={(e) => {
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => setDragging(false)}
    >
      {/* Old / current image — full, underneath */}
      <Image
        src={oldUrl}
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, 540px"
        className="object-cover pointer-events-none"
        unoptimized
        draggable={false}
      />

      {/* New image — clipped to the left of the divider */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <Image
          src={newUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 540px"
          className="object-cover pointer-events-none"
          unoptimized
          draggable={false}
        />
      </div>

      {/* Corner labels */}
      <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white pointer-events-none">
        Neu
      </span>
      <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white pointer-events-none">
        Aktuell
      </span>

      {/* Divider + grip */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)] pointer-events-none"
        style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
      >
        <div className="absolute top-1/2 left-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md flex items-center justify-center">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className="text-foreground"
            aria-hidden
          >
            <path d="M9 7l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
