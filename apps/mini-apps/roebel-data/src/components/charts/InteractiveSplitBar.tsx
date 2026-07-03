// Interactive stacked proportion bar + legend. Hover / tap a segment or legend
// row to highlight it across both; each row shows amount, count and share. Pure
// CSS (no SVG needed) — crisp and touch-friendly.
import { useState } from "react";
import { fmt, pct } from "../../lib/format";
import { C } from "../../lib/chartTheme";

export interface SplitPart {
  key: string;
  label: string;
  value: number;
  count: number;
  color: string;
}

export function InteractiveSplitBar({ parts }: { parts: SplitPart[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const [active, setActive] = useState<string | null>(null);
  const set = (k: string | null) => setActive(k);
  const toggle = (k: string) => setActive((a) => (a === k ? null : k));

  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => {
          const dim = active != null && active !== p.key;
          return (
            <button
              key={p.key}
              onMouseEnter={() => set(p.key)}
              onMouseLeave={() => set(null)}
              onClick={() => toggle(p.key)}
              aria-label={p.label}
              title={`${p.label}: ${fmt(p.value, 0)} · ${p.count}×`}
              style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color, opacity: dim ? 0.35 : 1 }}
              className="h-full min-w-[2px] transition-opacity duration-150"
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {parts.map((p) => {
          const on = active === p.key;
          return (
            <button
              key={p.key}
              onMouseEnter={() => set(p.key)}
              onMouseLeave={() => set(null)}
              onClick={() => toggle(p.key)}
              title={`${p.count} transfers`}
              className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-left transition ${on ? "bg-muted" : ""}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color, boxShadow: on ? `0 0 0 2px ${C.navyPale}` : undefined }} />
              <span className="truncate text-[13px] text-foreground">{p.label}</span>
              <span className="ml-auto text-[13px] font-semibold tabular-nums text-foreground">{fmt(p.value, 0)}</span>
              <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{pct(p.value / total, 0)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
