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

export interface SignupPoint {
  weekLabel: string;
  cumulative: number;
  new: number;
}

export function SignupsAreaChart({ data }: { data: SignupPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Noch keine Registrierungen
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
          <defs>
            <linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#194383" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#194383" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
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
              const numeric = typeof value === "number" ? value : Number(value ?? 0);
              return [numeric, name === "cumulative" ? "Gesamt" : "Neu"];
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
  );
}
