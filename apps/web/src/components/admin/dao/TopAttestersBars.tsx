"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DAO_CHART_COLORS } from "./colors";

export interface TopAttesterRow {
  shortAddress: string;
  fullAddress: string;
  approvals: number;
}

interface TopAttestersBarsProps {
  data: TopAttesterRow[];
}

export function TopAttestersBars({ data }: TopAttestersBarsProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Noch keine Verifizierungen
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="shortAddress"
            type="category"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
            width={120}
          />
          <Tooltip
            formatter={(value) => {
              const numeric = typeof value === "number" ? value : Number(value ?? 0);
              return [`${numeric} Verifizierungen`, ""];
            }}
            labelFormatter={(_, payload) => {
              const entry = payload?.[0]?.payload as TopAttesterRow | undefined;
              return entry?.fullAddress ?? "";
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
              fontSize: 12,
            }}
          />
          <Bar dataKey="approvals" fill={DAO_CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
