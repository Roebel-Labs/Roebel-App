"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEuros } from "@/lib/format-euros";
import type { RoebelCardChargeRow } from "@/lib/supabase-roebel-card-partners";

type Range = 7 | 30 | 90;
const RANGE_OPTIONS: Range[] = [7, 30, 90];

interface Props {
  charges: RoebelCardChargeRow[];
}

export function RevenueLineChart({ charges }: Props) {
  const [range, setRange] = useState<Range>(30);

  const data = useMemo(() => buildSeries(charges, range), [charges, range]);
  const total = useMemo(
    () => data.reduce((acc, p) => acc + p.cents, 0),
    [data],
  );

  return (
    <div className="bg-card border border-border rounded-[10px] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Umsatz
          </p>
          <p className="text-2xl font-semibold tabular-nums mt-0.5">
            {formatEuros(total)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bestätigte Zahlungen · letzte {range} Tage
          </p>
        </div>
        <div className="inline-flex items-center gap-1 bg-muted rounded-md p-0.5">
          {RANGE_OPTIONS.map((r) => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              onClick={() => setRange(r)}
              className={cn(
                "h-7 px-3 text-xs",
                range === r
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              {r} T
            </Button>
          ))}
        </div>
      </header>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="hsl(var(--border))"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              minTickGap={20}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickFormatter={(value: number) =>
                value >= 100 ? `${Math.round(value / 100)} €` : `${value} ct`
              }
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
              formatter={(value) => [
                formatEuros(typeof value === "number" ? value : Number(value)),
                "Umsatz",
              ]}
            />
            <Area
              type="monotone"
              dataKey="cents"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#revenueFill)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type Point = {
  iso: string;
  label: string;
  cents: number;
};

function buildSeries(charges: RoebelCardChargeRow[], days: number): Point[] {
  const buckets = new Map<string, Point>();
  const today = startOfLocalDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    buckets.set(iso, {
      iso,
      label: formatTickLabel(d, days),
      cents: 0,
    });
  }

  for (const c of charges) {
    if (c.status !== "approved") continue;
    const iso = startOfLocalDay(new Date(c.created_at))
      .toISOString()
      .slice(0, 10);
    const point = buckets.get(iso);
    if (point) point.cents += c.amount_cents;
  }

  return Array.from(buckets.values());
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function formatTickLabel(d: Date, days: number): string {
  if (days <= 7) {
    return d.toLocaleDateString("de-DE", { weekday: "short" });
  }
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}
