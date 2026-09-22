"use client";

import type { ReactNode } from "react";

/** DIN A portrait box (210:297) exactly like the Expo poster card; cover shows the crop the app does. */
export function AFrame({
  src,
  alt,
  fit = "cover",
  className = "",
  onClick,
  badge,
}: {
  src: string | null;
  alt: string;
  fit?: "cover" | "contain";
  className?: string;
  onClick?: () => void;
  badge?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[8px] border border-border bg-muted aspect-[210/297] ${onClick ? "cursor-zoom-in" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Kein Bild</div>
      )}
      {badge ? <div className="absolute left-2 top-2">{badge}</div> : null}
    </div>
  );
}
