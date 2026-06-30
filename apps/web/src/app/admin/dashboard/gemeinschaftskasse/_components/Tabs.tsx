"use client";
export function Tabs({
  tabs,
  active,
  onChange,
  badges,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
  badges?: Record<string, number>;
}) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors flex items-center gap-1.5 ${
            active === t ? "border-[#00498B] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t}
          {badges && badges[t] > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-[#00498B] text-white text-[10px] font-semibold min-w-[16px] h-4 px-1 leading-none">
              {badges[t]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
