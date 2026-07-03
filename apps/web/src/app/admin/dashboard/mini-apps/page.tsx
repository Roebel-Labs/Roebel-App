"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import {
  PageHeader,
  ErrorState,
  SkeletonGrid,
  EmptyHint,
  StatusBadge,
  AppIcon,
  categoryLabel,
} from "@/components/mini-apps/ui";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMiniAppApi } from "@/components/mini-apps/client";
import type { MiniAppRow } from "@/lib/miniapp/types";
import { timeAgo } from "@/components/admin/muenzen/format";

type Bucket = "pending" | "live" | "all";

const BUCKETS: { key: Bucket; label: string; query: string }[] = [
  { key: "pending", label: "In Prüfung", query: "status=pending,approved,draft" },
  { key: "live", label: "Live", query: "status=live" },
  { key: "all", label: "Alle", query: "" },
];

export default function MiniAppReviewQueue() {
  const [bucket, setBucket] = useState<Bucket>("pending");
  const active = BUCKETS.find((b) => b.key === bucket)!;
  const { data, loading, error, refresh, refreshing } = useMiniAppApi<{ apps: MiniAppRow[] }>(
    `list${active.query ? `?${active.query}` : ""}`,
  );
  const apps = data?.apps ?? [];

  return (
    <div>
      <PageHeader
        title="Mini Apps — Prüfung"
        description="Offene Einreichungen prüfen, im Playground testen und freigeben. Netizen-Plattform, Röbel ist der erste Host."
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <div className="mb-4 inline-flex items-center gap-1 rounded-md bg-muted p-0.5">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setBucket(b.key)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              bucket === b.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      {error && <ErrorState error={error} onRetry={refresh} />}

      {loading && !data ? (
        <SkeletonGrid count={4} />
      ) : apps.length === 0 ? (
        <EmptyHint>Keine Apps in dieser Ansicht.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <Link key={app.id} href={`/admin/dashboard/mini-apps/${app.id}`}>
              <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-accent">
                <AppIcon name={app.name} iconUrl={app.icon_url} color={app.primary_color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{app.name}</p>
                    {app.source === "ai_builder" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#00498B]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#00498B]">
                        <Sparkles className="h-2.5 w-2.5" /> KI
                      </span>
                    )}
                    {app.featured && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Empfohlen
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {categoryLabel(app.category)} · {app.slug} · {timeAgo(Date.parse(app.updated_at))}
                  </p>
                </div>
                <StatusBadge status={app.status} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
