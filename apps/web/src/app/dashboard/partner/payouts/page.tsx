"use client";

import { useEffect, useState } from "react";
import {
  fetchPayoutsByPartner,
  type RoebelCardPayoutRow,
  type PayoutStatus,
} from "@/lib/supabase-roebel-card-payouts";
import { usePartner } from "../_components/PartnerContext";
import { ComingSoonCard } from "../_components/ComingSoonCard";
import { formatEuros } from "@/lib/format-euros";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: "Geplant",
  sent: "Ausgezahlt",
  failed: "Fehlgeschlagen",
};

const STATUS_CLASSES: Record<PayoutStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400",
  sent: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400",
};

export default function PartnerPayoutsPage() {
  const partner = usePartner();
  const [payouts, setPayouts] = useState<RoebelCardPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const rows = await fetchPayoutsByPartner(partner.id);
      if (!cancelled) {
        setPayouts(rows);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-[10px] p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Aktuell offen
        </p>
        <p className="text-3xl font-semibold mt-1 tabular-nums">
          {formatEuros(partner.pending_balance_cents)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Wird mit der nächsten Auszahlung auf{" "}
          <span className="font-mono">
            {partner.iban_last4 ? `•••• ${partner.iban_last4}` : "deine IBAN"}
          </span>{" "}
          überwiesen.
        </p>
      </div>

      {loading ? (
        <div className="h-32 bg-muted rounded-[10px] animate-pulse" />
      ) : payouts.length === 0 ? (
        <div className="bg-card border border-border rounded-[10px] p-8 text-center text-sm text-muted-foreground">
          Noch keine Auszahlungen erfolgt
        </div>
      ) : (
        <div className="bg-card border border-border rounded-[10px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-4 py-3">Referenz</th>
                  <th className="text-left font-medium px-4 py-3">Zeitraum</th>
                  <th className="text-right font-medium px-4 py-3">Betrag</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {p.reference ?? p.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatGermanDate(p.period_start)} –{" "}
                      {formatGermanDate(p.period_end)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatEuros(p.amount_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          STATUS_CLASSES[p.status],
                        )}
                      >
                        {STATUS_LABELS[p.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ComingSoonCard
        title="Auszahlungs-Steuerung — bald verfügbar"
        description="Du wirst hier den Auszahlungsrhythmus konfigurieren und einzelne Auszahlungen manuell anstoßen können."
      />
    </div>
  );
}

function formatGermanDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
