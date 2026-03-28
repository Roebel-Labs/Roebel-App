import { de } from "@/lib/translations/de";

interface StatusBadgeProps {
  status: "Pending" | "Approved" | "Rejected" | "Executed";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colors = {
    Pending: "bg-muted text-foreground border-border",
    Approved: "bg-card text-foreground border-gray-400",
    Rejected: "bg-card text-foreground border-border",
    Executed: "bg-muted text-foreground border-gray-400",
  };

  const labels = {
    Pending: de.verification.pending,
    Approved: de.verification.approved,
    Rejected: de.verification.rejected,
    Executed: de.verification.executed,
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded border ${colors[status]}`}
    >
      {labels[status]}
    </span>
  );
}
