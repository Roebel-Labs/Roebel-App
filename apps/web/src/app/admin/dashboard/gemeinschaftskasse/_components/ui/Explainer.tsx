"use client";
import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

/** Collapsible "how it works" panel. Quiet by default; expands on demand. */
export function Explainer({
  title = "So funktioniert die Gemeinschaftskasse",
  defaultOpen = false,
  children,
}: {
  title?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <HelpCircle className="h-4 w-4 text-[#00498B]" />
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
      )}
    </div>
  );
}
