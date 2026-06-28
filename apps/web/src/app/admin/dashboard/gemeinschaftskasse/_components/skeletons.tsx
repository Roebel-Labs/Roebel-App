"use client";
import { Skeleton } from "@/components/ui/skeleton";

export function BalanceSkeleton() {
  return (
    <div className="rounded-lg border border-border p-5 space-y-3">
      <Skeleton className="h-4 w-32" /><Skeleton className="h-9 w-44" /><Skeleton className="h-3 w-48" />
    </div>
  );
}
export function OwnerListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16" /></div>
        </div>
      ))}
    </div>
  );
}
export function HistorySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="py-3 flex items-center justify-between gap-3">
          <div className="space-y-1.5"><Skeleton className="h-4 w-52" /><Skeleton className="h-3 w-24" /></div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
