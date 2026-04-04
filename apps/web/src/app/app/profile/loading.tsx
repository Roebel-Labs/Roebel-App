export default function ProfileLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="h-32 sm:h-44 bg-muted animate-pulse" />
        <div className="px-4 sm:px-6 pb-4">
          <div className="-mt-10 mb-3">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-muted border-4 border-card animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-5 bg-muted rounded w-32 animate-pulse" />
            <div className="h-4 bg-muted rounded w-48 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="h-44 bg-card border border-border rounded-xl animate-pulse" />
      <div className="h-32 bg-card border border-border rounded-lg animate-pulse" />
    </div>
  );
}
