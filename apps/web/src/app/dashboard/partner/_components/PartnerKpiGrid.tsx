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
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const monthAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  let todayCents = 0;
  const customerCards = new Set<string>();

  for (const c of charges) {
    if (c.status !== "approved") continue;
    const ts = new Date(c.created_at).getTime();
    if (ts >= startOfTodayMs) todayCents += c.amount_cents;
    if (ts >= monthAgoMs) customerCards.add(c.card_id);
  }

  return [
    { label: "Heute", value: formatEuros(todayCents) },
    {
      label: "Stammkunden",
      value: String(customerCards.size),
      hint: "Einzigartige Karten (30 T)",
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
