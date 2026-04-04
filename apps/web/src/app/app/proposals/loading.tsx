export default function ProposalsLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-lg animate-pulse p-4 space-y-3">
          <div className="h-5 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-1/4" />
        </div>
      ))}
    </div>
  );
}
