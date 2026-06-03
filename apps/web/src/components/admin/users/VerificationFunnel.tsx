"use client";

export interface FunnelSegment {
  status: string;
  label: string;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  approved: "#16a34a",
  rejected: "#dc2626",
};

export function VerificationFunnel({ data }: { data: FunnelSegment[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">Noch keine Nutzer.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {data.map((segment) => {
          const width = (segment.count / total) * 100;
          if (width === 0) return null;
          return (
            <div
              key={segment.status}
              style={{
                width: `${width}%`,
                backgroundColor: STATUS_COLORS[segment.status] ?? "#94a3b8",
              }}
              title={`${segment.label}: ${segment.count}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {data.map((segment) => (
          <div key={segment.status} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[segment.status] ?? "#94a3b8" }}
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{segment.label}</p>
              <p className="text-sm font-medium">
                {segment.count}{" "}
                <span className="text-xs text-muted-foreground">
                  ({Math.round((segment.count / total) * 100)} %)
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
