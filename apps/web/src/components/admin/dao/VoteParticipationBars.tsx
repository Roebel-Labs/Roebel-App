"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DAO_CHART_COLORS } from "./colors";

export interface ParticipationRow {
  label: string;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
}

interface VoteParticipationBarsProps {
  data: ParticipationRow[];
}

export function VoteParticipationBars({ data }: VoteParticipationBarsProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Noch keine Stimmen abgegeben
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            angle={-15}
            textAnchor="end"
            height={48}
            interval={0}
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
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Bar
            dataKey="forVotes"
            name="Dafür"
            stackId="votes"
            fill={DAO_CHART_COLORS.success}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="againstVotes"
            name="Dagegen"
            stackId="votes"
            fill={DAO_CHART_COLORS.destructive}
          />
          <Bar
            dataKey="abstainVotes"
            name="Enthaltung"
            stackId="votes"
            fill={DAO_CHART_COLORS.muted}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
