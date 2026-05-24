"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  fetchChargesForPartner,
  type RoebelCardChargeRow,
} from "@/lib/supabase-roebel-card-partners";
import { usePartner } from "./_components/PartnerContext";
import { PartnerKpiGrid } from "./_components/PartnerKpiGrid";
import { RevenueLineChart } from "./_components/RevenueLineChart";
import { ChargesTable } from "./_components/ChargesTable";

export default function PartnerOverviewPage() {
  const partner = usePartner();
  const [charges, setCharges] = useState<RoebelCardChargeRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-muted rounded-[10px] animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 bg-muted rounded-[10px] animate-pulse" />
        <div className="h-48 bg-muted rounded-[10px] animate-pulse" />
      </div>
    );
  }

  const recent = charges.slice(0, 10);

  return (
    <div className="space-y-4">
      <PartnerKpiGrid partner={partner} charges={charges} />

      <RevenueLineChart charges={charges} />

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Letzte Transaktionen
          </h2>
          <Link
            href="/dashboard/partner/transactions"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Alle ansehen <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </header>
        <ChargesTable charges={recent} variant="compact" />
      </section>
    </div>
  );
}
