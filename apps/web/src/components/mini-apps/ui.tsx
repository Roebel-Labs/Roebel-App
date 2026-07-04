"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MiniAppStatus } from "@/lib/miniapp/types";

// Re-export the muenzen console kit so the two surfaces look identical.
export {
  PageHeader,
  KpiCard,
  ChartCard,
  Pill,
  EmptyHint,
  ErrorState,
  SkeletonGrid,
} from "@/components/admin/muenzen/ui";

/**
 * Horizontal row of square (1:1) mini-app preview images. Scrolls sideways when it
 * overflows. Used on the mini-app detail pages (admin + builder). Renders nothing
 * when there are no images.
 */
export function MiniAppPreviewRow({
  images,
  className,
  size = "lg",
}: {
  images?: string[] | null;
  className?: string;
  size?: "sm" | "lg";
}) {
  if (!images || images.length === 0) return null;
  const box = size === "sm" ? "h-24 w-24" : "h-40 w-40";
  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-1", className)}>
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt="Vorschau"
          loading="lazy"
          className={cn(
            "aspect-square shrink-0 rounded-[10px] border border-border bg-muted object-cover",
            box,
          )}
        />
      ))}
    </div>
  );
}

const STATUS_META: Record<
  MiniAppStatus,
  { label: string; className: string }
> = {
  draft: { label: "Entwurf", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  pending: { label: "In Prüfung", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  approved: { label: "Freigegeben", className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  live: { label: "Live", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Abgelehnt", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  suspended: { label: "Gesperrt", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export function StatusBadge({ status }: { status: MiniAppStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  community: "Gemeinschaft",
  governance: "Mitbestimmung",
  finance: "Finanzen",
  utility: "Werkzeuge",
  games: "Spiele",
  education: "Bildung",
  news: "Neuigkeiten",
  culture: "Kultur",
  environment: "Umwelt",
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? c;
}

/** App icon tile with a fallback initial on the app's primary color. */
export function AppIcon({
  name,
  iconUrl,
  color = "#00498B",
  size = 40,
}: {
  name: string;
  iconUrl?: string | null;
  color?: string | null;
  size?: number;
}) {
  const initial = (name || "?").charAt(0).toUpperCase();
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[10px] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[10px] text-sm font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: color ?? "#00498B" }}
    >
      {initial}
    </span>
  );
}

/** Simple tab bar (mirrors MuenzenTabs). */
export function TabNav({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 -mt-1 overflow-x-auto border-b border-border">
      <nav className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#00498B]" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function DetailCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}
