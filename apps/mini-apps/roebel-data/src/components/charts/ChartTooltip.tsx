// Shared floating tooltip card for the visx charts — shadcn idiom (navy card,
// 10px radius, hairline border). Positioned by visx's TooltipWithBounds so it
// auto-flips at the chart edges.
import { TooltipWithBounds, defaultStyles } from "@visx/tooltip";

export interface TooltipRow {
  color?: string;
  label: string;
  value: string;
  bold?: boolean;
}

export function ChartTooltip({ left, top, title, rows }: { left: number; top: number; title?: string; rows: TooltipRow[] }) {
  return (
    <TooltipWithBounds
      left={left}
      top={top}
      style={{ ...defaultStyles, position: "absolute", padding: 0, background: "transparent", boxShadow: "none" }}
    >
      <div className="pointer-events-none min-w-[112px] rounded-[10px] border border-border bg-card px-2.5 py-2 shadow-md">
        {title && <div className="mb-1 text-[11px] font-semibold leading-none text-foreground">{title}</div>}
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] leading-none">
              {r.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />}
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`ml-auto pl-3 tabular-nums ${r.bold ? "font-semibold text-foreground" : "text-foreground"}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </TooltipWithBounds>
  );
}
