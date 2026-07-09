// Route-segment fallback for /dashboard/mini-apps — mirrors the redesigned
// dashboard: top bar with selector, welcome headline, hero stat + chart,
// metric-card grid. No layout jump when the client page takes over.
export default function MiniAppsLoading() {
  return (
    <div className="min-h-screen bg-background" aria-busy>
      <div className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 animate-pulse rounded-[8px] bg-muted/60" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted/50" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted/50" />
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted/60" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="h-8 w-64 animate-pulse rounded bg-muted/60" />
        <div className="mt-6 flex items-center justify-between">
          <div className="h-9 w-36 animate-pulse rounded-full bg-muted/50" />
          <div className="h-9 w-32 animate-pulse rounded-full bg-muted/50" />
        </div>
        <div className="mt-8 space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-muted/50" />
          <div className="h-9 w-24 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="mt-4 h-56 animate-pulse rounded-lg border border-border bg-muted/30" />
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
