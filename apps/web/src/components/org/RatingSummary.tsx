"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountRatingSummary } from "@/lib/supabase-ratings";

interface RatingSummaryProps {
  summary: AccountRatingSummary | null;
  size?: "sm" | "md";
  showCount?: boolean;
}

export function RatingSummary({
  summary,
  size = "md",
  showCount = true,
}: RatingSummaryProps) {
  const avg = summary?.avg_stars ?? 0;
  const count = summary?.rating_count ?? 0;
  const starSize = size === "sm" ? 14 : 16;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={starSize}
            className={cn(
              n <= Math.round(avg)
                ? "fill-amber-400 text-amber-400"
                : "fill-none text-muted-foreground/40"
            )}
          />
        ))}
      </div>
      <span
        className={cn(
          "font-medium text-foreground",
          size === "sm" ? "text-xs" : "text-sm"
        )}
      >
        {count > 0 ? avg.toFixed(1) : "–"}
      </span>
      {showCount && count > 0 && (
        <span
          className={cn(
            "text-muted-foreground",
            size === "sm" ? "text-xs" : "text-sm"
          )}
        >
          ({count})
        </span>
      )}
    </div>
  );
}
