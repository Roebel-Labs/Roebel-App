export default function OrgDashboardLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="h-20 bg-card border border-border rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-card border border-border rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}
