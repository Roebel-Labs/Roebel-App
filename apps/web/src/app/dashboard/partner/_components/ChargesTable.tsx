"use client";

import { cn } from "@/lib/utils";
import { formatEuros } from "@/lib/format-euros";
import type {
  RoebelCardChargeRow,
  RoebelCardChargeStatus,
} from "@/lib/supabase-roebel-card-partners";

const STATUS_META: Record<
  RoebelCardChargeStatus,
  { label: string; dotClass: string }
> = {
  pending: { label: "Ausstehend", dotClass: "bg-primary" },
  approved: { label: "Bestätigt", dotClass: "bg-green-500" },
  declined: { label: "Abgelehnt", dotClass: "bg-red-500" },
  expired: { label: "Abgelaufen", dotClass: "bg-muted-foreground" },
  reversed: { label: "Storniert", dotClass: "bg-muted-foreground" },
};

interface Props {
  charges: RoebelCardChargeRow[];
  variant?: "compact" | "full";
  emptyText?: string;
}

export function ChargesTable({
  charges,
  variant = "full",
  emptyText = "Noch keine Transaktionen",
}: Props) {
  if (charges.length === 0) {
    return (
      <div className="bg-card border border-border rounded-[10px] p-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const showNote = variant === "full";
  const showIdSuffix = variant === "full";

  return (
    <div className="bg-card border border-border rounded-[10px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium px-4 py-3">Datum</th>
              <th className="text-right font-medium px-4 py-3">Betrag</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              {showNote ? (
                <th className="text-left font-medium px-4 py-3">Notiz</th>
              ) : null}
              {showIdSuffix ? (
                <th className="text-left font-medium px-4 py-3">Ref</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {charges.map((c) => {
              const meta = STATUS_META[c.status];
              return (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-foreground tabular-nums whitespace-nowrap">
                    {formatGermanDateTime(c.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatEuros(c.amount_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-foreground">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          meta.dotClass,
                        )}
                      />
                      {meta.label}
                    </span>
                  </td>
                  {showNote ? (
                    <td className="px-4 py-3 text-muted-foreground max-w-[18ch] truncate">
                      {c.partner_note ?? "—"}
                    </td>
                  ) : null}
                  {showIdSuffix ? (
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {c.id.slice(0, 8)}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatGermanDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
