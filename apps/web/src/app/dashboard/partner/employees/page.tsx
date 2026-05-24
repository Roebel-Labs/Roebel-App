"use client";

import { useEffect, useState } from "react";
import {
  fetchEmployeesByEmployerAccount,
  type RoebelCardEmployeeRow,
} from "@/lib/supabase-roebel-card-employees";
import { usePartner } from "../_components/PartnerContext";
import { ComingSoonCard } from "../_components/ComingSoonCard";
import { formatEuros } from "@/lib/format-euros";
import { cn } from "@/lib/utils";

const STATUS_LABELS = {
  invited: "Eingeladen",
  active: "Aktiv",
  deactivated: "Deaktiviert",
} as const;

const STATUS_CLASSES = {
  invited: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400",
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400",
  deactivated: "bg-muted text-muted-foreground",
} as const;

export default function PartnerEmployeesPage() {
  const partner = usePartner();
  const [employees, setEmployees] = useState<RoebelCardEmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const rows = await fetchEmployeesByEmployerAccount(partner.account_id);
      if (!cancelled) {
        setEmployees(rows);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [partner.account_id]);

  if (loading) {
    return <div className="h-48 bg-muted rounded-[10px] animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {employees.length === 0 ? (
        <div className="bg-card border border-border rounded-[10px] p-8 text-center text-sm text-muted-foreground">
          Noch keine Mitarbeiter eingeladen.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-[10px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-4 py-3">Mitarbeiter</th>
                  <th className="text-left font-medium px-4 py-3">Wallet</th>
                  <th className="text-right font-medium px-4 py-3">Monatlich</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-3 font-medium">
                      {e.employee_label ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {e.employee_wallet_address
                        ? `${e.employee_wallet_address.slice(0, 6)}…${e.employee_wallet_address.slice(-4)}`
                        : `pending:${e.invite_code}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatEuros(e.monthly_topup_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          STATUS_CLASSES[e.status],
                        )}
                      >
                        {STATUS_LABELS[e.status]}
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
        title="Mitarbeiter einladen (Sachbezug) — bald verfügbar"
        description="Du wirst hier Mitarbeiter:innen mit monatlichem Sachbezug einladen können (§8 EStG, bis 50 € steuerfrei)."
      />
    </div>
  );
}
