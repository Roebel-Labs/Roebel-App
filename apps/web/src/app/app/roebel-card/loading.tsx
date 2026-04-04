export default function RoebelCardLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="h-48 bg-muted rounded-xl animate-pulse" />
      <div className="h-20 bg-card border border-border rounded-lg animate-pulse" />
      <div className="h-64 bg-card border border-border rounded-lg animate-pulse" />
    </div>
  );
}
