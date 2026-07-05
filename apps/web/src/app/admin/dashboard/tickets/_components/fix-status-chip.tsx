import type { DevTicket } from "@/types/dev-tickets";

const CHIP: Record<string, { label: string; cls: string }> = {
  queued: { label: "KI eingeplant", cls: "bg-amber-100 text-amber-800" },
  running: { label: "KI arbeitet…", cls: "bg-blue-100 text-blue-800" },
  pr_open: { label: "PR offen", cls: "bg-purple-100 text-purple-800" },
  failed: { label: "Fix fehlgeschlagen", cls: "bg-red-100 text-red-800" },
  merged: { label: "Gemergt", cls: "bg-green-100 text-green-800" },
};

export function FixStatusChip({ ticket }: { ticket: DevTicket }) {
  const chip = CHIP[ticket.fix_status];
  if (!chip) return null;
  const label =
    ticket.fix_status === "pr_open" && ticket.github_pr_number
      ? `PR #${ticket.github_pr_number}`
      : chip.label;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.cls}`}
    >
      {label}
    </span>
  );
}
