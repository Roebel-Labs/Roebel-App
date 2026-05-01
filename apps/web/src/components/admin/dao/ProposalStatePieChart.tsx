"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PROPOSAL_STATE_COLORS } from "./colors";

interface Slice {
  state: number;
  label: string;
  count: number;
}

interface ProposalStatePieChartProps {
  data: Slice[];
}

export function ProposalStatePieChart({ data }: ProposalStatePieChartProps) {
  const filtered = data.filter((d) => d.count > 0);
  const total = filtered.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Keine Proposals vorhanden
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
          >
            {filtered.map((slice) => (
              <Cell
                key={slice.state}
                fill={PROPOSAL_STATE_COLORS[slice.state] ?? "#94a3b8"}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => {
              const numeric = typeof value === "number" ? value : Number(value ?? 0);
              return [
                `${numeric} (${Math.round((numeric / total) * 100)}%)`,
                String(name ?? ""),
              ];
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
              fontSize: 12,
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={32}
            iconType="circle"
            wrapperStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
