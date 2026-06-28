"use client";
export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            active === t ? "border-[#00498B] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
