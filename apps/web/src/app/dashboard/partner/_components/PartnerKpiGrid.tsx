"use client";

import { useMemo } from "react";
import { formatEuros } from "@/lib/format-euros";
import type {
  RoebelCardChargeRow,
  RoebelCardPartnerRow,
} from "@/lib/supabase-roebel-card-partners";

type KpiTile = {
  label: string;
  value: string;
  hint?: string;
};

interface Props {
  partner: RoebelCardPartnerRow;
  charges: RoebelCardChargeRow[];
}

export function PartnerKpiGrid({ partner, charges }: Props) {
  const tiles = useMemo<KpiTile[]>(
    () => computeKpiTiles(partner, charges),
    [partner, charges],
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="bg-card border border-border rounded-[10px] p-4"
        >
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {tile.value}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{tile.label}</p>
          {tile.hint ? (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {tile.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function computeKpiTiles(
  partner: RoebelCardPartnerRow,
  charges: RoebelCardChargeRow[],
): KpiTile[] {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const weekAgoMs = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgoMs = now - 30 * 24 * 60 * 60 * 1000;

  let todayCents = 0;
  let weekCents = 0;
  let monthCents = 0;
  let monthApproved = 0;
  let monthResolved = 0; // approved + declined + expired in last 30d
  const customerCounts = new Map<string, number>();

  for (const c of charges) {
    const ts = new Date(c.created_at).getTime();
    if (c.status === "approved") {
      if (ts >= startOfTodayMs) todayCents += c.amount_cents;
      if (ts >= weekAgoMs) weekCents += c.amount_cents;
      if (ts >= monthAgoMs) {
        monthCents += c.amount_cents;
        monthApproved += 1;
        customerCounts.set(
          c.card_id,
          (customerCounts.get(c.card_id) ?? 0) + 1,
        );
      }
    }
    if (
      ts >= monthAgoMs &&
      (c.status === "approved" ||
        c.status === "declined" ||
        c.status === "expired")
    ) {
      monthResolved += 1;
    }
  }

  const uniqueCustomers = customerCounts.size;
  const repeatCustomers = Array.from(customerCounts.values()).filter(
    (n) => n >= 2,
  ).length;
  const approvalRate =
    monthResolved > 0
      ? Math.round((monthApproved / monthResolved) * 100)
      : null;
  const repeatRate =
    uniqueCustomers > 0
      ? Math.round((repeatCustomers / uniqueCustomers) * 100)
      : null;

  return [
    { label: "Heute", value: formatEuros(todayCents) },
    { label: "7 Tage", value: formatEuros(weekCents) },
    { label: "30 Tage", value: formatEuros(monthCents) },
    {
      label: "Quote",
      value: approvalRate !== null ? `${approvalRate} %` : "—",
      hint: "Bestätigt vs. abgelehnt (30 T)",
    },
    {
      label: "Stammkunden",
      value: String(uniqueCustomers),
      hint: "Einzigartige Karten (30 T)",
    },
    {
      label: "Wiederkehrer",
      value: repeatRate !== null ? `${repeatRate} %` : "—",
      hint: "Karten mit ≥ 2 Zahlungen",
    },
    {
      label: "Offen",
      value: formatEuros(partner.pending_balance_cents),
      hint: "Wartet auf Auszahlung",
    },
    {
      label: "Lifetime",
      value: formatEuros(partner.lifetime_volume_cents),
      hint: "Gesamtumsatz",
    },
  ];
}
