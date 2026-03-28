export default function AppLoading() {
  return (
    <div className="space-y-4">
      {/* Post composer skeleton */}
      <div className="h-16 bg-card rounded-lg border border-border animate-pulse" />

      {/* Feed filters skeleton */}
      <div className="h-10 bg-card rounded-lg border border-border animate-pulse" />

      {/* Feed cards skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-card rounded-lg border border-border animate-pulse"
        >
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-muted rounded-full" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-muted rounded" />
              <div className="h-4 w-3/4 bg-muted rounded" />
            </div>
            <div className="h-40 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
