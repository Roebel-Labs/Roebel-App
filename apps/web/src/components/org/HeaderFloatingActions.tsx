"use client";

import { Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type FloatingAction =
  | { kind: "search"; onClick: () => void; label?: string }
  | { kind: "rate"; onClick: () => void; active?: boolean; label?: string };

interface HeaderFloatingActionsProps {
  actions: FloatingAction[];
}

export function HeaderFloatingActions({ actions }: HeaderFloatingActionsProps) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
      {actions.map((action, i) => (
        <button
          key={i}
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur transition-colors hover:bg-background"
          )}
        >
          {action.kind === "search" ? (
            <Search size={18} className="text-foreground" />
          ) : (
            <Star
              size={18}
              className={cn(
                "active" in action && action.active
                  ? "fill-amber-400 text-amber-400"
                  : "text-foreground"
              )}
            />
          )}
        </button>
      ))}
    </div>
  );
}
