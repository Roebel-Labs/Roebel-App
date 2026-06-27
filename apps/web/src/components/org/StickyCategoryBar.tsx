"use client";

import { useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface StickyCategoryBarProps {
  categories: { id: string; name: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onOpenSheet: () => void;
}

export function StickyCategoryBar({
  categories,
  activeIndex,
  onSelect,
  onOpenSheet,
}: StickyCategoryBarProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background/95 backdrop-blur">
      <button
        type="button"
        onClick={onOpenSheet}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Kategorien"
      >
        <Menu size={20} />
      </button>
      <div className="flex flex-1 items-center gap-4 overflow-x-auto scrollbar-none">
        {categories.map((cat, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={cat.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "relative whitespace-nowrap py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {cat.name}
              {isActive && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
