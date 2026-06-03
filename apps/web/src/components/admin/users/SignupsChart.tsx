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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SignupRow } from "@/app/actions/users-admin";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type PlatformFilter = "all" | "ios" | "android" | "unknown";

function matches(filter: PlatformFilter, platform: string | null): boolean {
  if (filter === "all") return true;
  if (filter === "unknown") return platform === null;
  return platform === filter;
}

export function SignupsChart({ rows }: { rows: SignupRow[] }) {
  const [filter, setFilter] = useState<PlatformFilter>("all");

  const data = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const r of rows) {
      if (!matches(filter, r.platform)) continue;
      const ms = new Date(r.created_at).getTime();
      if (!Number.isFinite(ms)) continue;
      const bucket = Math.floor(ms / WEEK_MS) * WEEK_MS;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    const ordered = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
    let cumulative = 0;
    return ordered.map(([bucket, count]) => {
      cumulative += count;
      const start = new Date(bucket);
      const end = new Date(bucket + 6 * 24 * 60 * 60 * 1000);
      return {
        weekLabel: `${start.toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "short",
        })}`,
        rangeLabel: `Woche ${start.toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "short",
        })}–${end.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}`,
        cumulative,
        new: count,
      };
    });
  }, [rows, filter]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Select value={filter} onValueChange={(v) => setFilter(v as PlatformFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Plattform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Plattformen</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
            <SelectItem value="android">Android</SelectItem>
            <SelectItem value="unknown">Unbekannt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Keine Registrierungen für diese Auswahl
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 4, right: 16, left: -8, bottom: 4 }}
            >
              <defs>
                <linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#194383" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#194383" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                formatter={(value, name) => {
                  const numeric =
                    typeof value === "number" ? value : Number(value ?? 0);
                  return [numeric, name === "cumulative" ? "Gesamt" : "Neu"];
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as
                    | { rangeLabel?: string }
                    | undefined;
                  return p?.rangeLabel ?? "";
                }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--card))",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="#194383"
                strokeWidth={2}
                fill="url(#signupsFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
