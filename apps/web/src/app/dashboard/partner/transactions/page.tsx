"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchChargesForPartner,
  type RoebelCardChargeRow,
  type RoebelCardChargeStatus,
} from "@/lib/supabase-roebel-card-partners";
import { usePartner } from "../_components/PartnerContext";
import { ChargesTable } from "../_components/ChargesTable";
import { ExportCsvButton } from "../_components/ExportCsvButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: RoebelCardChargeStatus; label: string }[] = [
  { value: "approved", label: "Bestätigt" },
  { value: "pending", label: "Ausstehend" },
  { value: "declined", label: "Abgelehnt" },
  { value: "expired", label: "Abgelaufen" },
  { value: "reversed", label: "Storniert" },
];

export default function PartnerTransactionsPage() {
  const partner = usePartner();
  const [charges, setCharges] = useState<RoebelCardChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatuses, setSelectedStatuses] = useState<
    Set<RoebelCardChargeStatus>
  >(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const rows = await fetchChargesForPartner(partner.id, 90);
      if (!cancelled) {
        setCharges(rows);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return charges.filter((c) => {
      if (selectedStatuses.size > 0 && !selectedStatuses.has(c.status)) {
        return false;
      }
      if (needle && !(c.partner_note ?? "").toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [charges, selectedStatuses, search]);

  const toggleStatus = (status: RoebelCardChargeStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-[10px] p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = selectedStatuses.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatus(opt.value)}
                className={cn(
                  "text-xs px-3 py-1 rounded-full border transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            );
          })}
          {selectedStatuses.size > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedStatuses(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground ml-1"
            >
              Filter zurücksetzen
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="In Notiz suchen..."
            className="max-w-xs h-9"
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length} von {charges.length}
            </span>
            <ExportCsvButton charges={filtered} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 bg-muted rounded-[10px] animate-pulse" />
      ) : (
        <ChargesTable
          charges={filtered}
          variant="full"
          emptyText={
            charges.length === 0
              ? "Noch keine Transaktionen in den letzten 90 Tagen"
              : "Keine Treffer für diesen Filter"
          }
        />
      )}
    </div>
  );
}
