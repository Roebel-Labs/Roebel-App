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
import type { StoreDailyPoint } from "@/app/actions/store-admin";

/** Daily store downloads (last 60 days) — one line per platform. */
export function StoreDownloadsChart({ daily }: { daily: StoreDailyPoint[] }) {
  const data = useMemo(
    () =>
      daily.map((d) => ({
        ...d,
        label: new Date(d.date).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
        }),
      })),
    [daily]
  );

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
            dataKey="ios"
            name="App Store (iOS)"
            stroke="#194383"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="android"
            name="Play Store (Android)"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
