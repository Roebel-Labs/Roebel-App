"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint } from "@/app/actions/users-admin";

interface DailyActivityChartProps {
  registrations: DailyPoint[];
  activeProxy: DailyPoint[];
  activeReal: DailyPoint[];
}

/**
 * Daily line chart over the last 60 days combining:
 * - Registrierungen: new users/day (users.created_at)
 * - Aktiv (Proxy): distinct wallets/day from the points ledger
 * - DAU (echt): distinct wallets/day from app_activity (accrues going forward)
 */
export function DailyActivityChart({
  registrations,
  activeProxy,
  activeReal,
}: DailyActivityChartProps) {
  const data = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; reg: number; proxy: number; dau: number }
    >();
    const ensure = (date: string) =>
      byDate.get(date) ?? { date, reg: 0, proxy: 0, dau: 0 };
    for (const p of registrations) {
      const e = ensure(p.date);
      e.reg = p.count;
      byDate.set(p.date, e);
    }
    for (const p of activeProxy) {
      const e = ensure(p.date);
      e.proxy = p.count;
      byDate.set(p.date, e);
    }
    for (const p of activeReal) {
      const e = ensure(p.date);
      e.dau = p.count;
      byDate.set(p.date, e);
    }
    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({
        ...e,
        label: new Date(e.date).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
        }),
      }));
  }, [registrations, activeProxy, activeReal]);

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
              fontSize: 12,
            }}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="dau"
            name="DAU (echt)"
            stroke="#194383"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="proxy"
            name="Aktiv (Proxy)"
            stroke="#16a34a"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="reg"
            name="Registrierungen"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
