"use client";
import { Info } from "lucide-react";

/** Inline `ⓘ` with a hover/focus tooltip — pure CSS, no popover lib. */
export function InfoTooltip({ text, label }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle">
      {label}
      <button
        type="button"
        aria-label="Erklärung anzeigen"
        className="ml-1 inline-flex cursor-help text-muted-foreground hover:text-foreground focus:outline-none focus-visible:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-56 -translate-x-1/2 rounded-md bg-foreground px-3 py-2 text-xs font-normal leading-snug text-background shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
