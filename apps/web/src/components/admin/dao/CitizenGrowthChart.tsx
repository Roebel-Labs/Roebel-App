"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DAO_BRAND } from "./colors";

export interface GrowthPoint {
  weekLabel: string;
  cumulativeCitizens: number;
  cumulativeAttesters: number;
}

interface CitizenGrowthChartProps {
  data: GrowthPoint[];
}

export function CitizenGrowthChart({ data }: CitizenGrowthChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Noch keine Mints
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="citizenFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DAO_BRAND} stopOpacity={0.4} />
              <stop offset="100%" stopColor={DAO_BRAND} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="attesterFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="weekLabel"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulativeCitizens"
            name="Bürger gesamt"
            stroke={DAO_BRAND}
            strokeWidth={2}
            fill="url(#citizenFill)"
          />
          <Area
            type="monotone"
            dataKey="cumulativeAttesters"
            name="Bescheiniger gesamt"
            stroke="#f59e0b"
            strokeWidth={2}
            fill="url(#attesterFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
