// Route-segment fallback for /dashboard/mini-apps — mirrors the page header +
// app rows so the transition into the client page doesn't jump. Renders inside
// the mini-apps layout, so the TabNav stays visible above it.
import { AppListSkeleton } from "@/components/mini-apps/ui";

export default function MiniAppsLoading() {
  return (
    <div aria-busy>
      <div className="mb-6 space-y-2">
        <div className="h-6 w-44 animate-pulse rounded bg-muted/60" />
        <div className="h-3.5 w-full max-w-lg animate-pulse rounded bg-muted/50" />
      </div>
      <AppListSkeleton count={3} />
    </div>
  );
}
