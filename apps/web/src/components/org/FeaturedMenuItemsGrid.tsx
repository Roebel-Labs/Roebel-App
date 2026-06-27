"use client";

import Link from "next/link";
import { MenuItemThumbs } from "./MenuItemThumbs";
import { formatPrice } from "@/types/restaurant";
import type { MenuItemWithFlags } from "@/lib/supabase-gastro";
import type { MenuItemVoteSummary } from "@/lib/supabase-ratings";

interface FeaturedMenuItemsGridProps {
  slug: string;
  items: MenuItemWithFlags[];
  voteSummaries: Record<string, MenuItemVoteSummary>;
}

function score(summary: MenuItemVoteSummary | undefined): number {
  if (!summary) return 0;
  return (summary.percent_liked / 100) * Math.log10(summary.vote_count + 1);
}

export function FeaturedMenuItemsGrid({
  slug,
  items,
  voteSummaries,
}: FeaturedMenuItemsGridProps) {
  const ranked = [...items]
    .map((item) => ({ item, s: score(voteSummaries[item.id]) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map((x) => x.item);

  if (ranked.length === 0) return null;

  return (
    <div className="py-4">
      <h2 className="mb-3 px-1 text-sm font-semibold text-foreground">
        Beliebt
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
        {ranked.map((item, idx) => (
          <Link
            key={item.id}
            href={`/app/orgs/${slug}/menu/${item.id}`}
            className="group relative w-40 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="relative aspect-square w-full bg-muted">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : null}
              {idx < 3 && (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  #{idx + 1} Beliebt
                </span>
              )}
            </div>
            <div className="space-y-1 p-2.5">
              <p className="line-clamp-1 text-sm font-medium text-foreground">
                {item.name}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {item.has_variants ? "ab " : ""}
                  {formatPrice(item.price)}
                </span>
                <MenuItemThumbs summary={voteSummaries[item.id] ?? null} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
