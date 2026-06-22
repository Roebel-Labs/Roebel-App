// Dependency-free radial graph in the apps/web "card node" idiom: a navy center
// node with member cards on one or two rings, each card carrying the member's real
// Circles avatar + name, and edges drawn behind. HTML cards (for avatars + text)
// over an SVG edge layer — no heavy force-graph library, mobile-friendly, monochrome
// (navy = in the group, neutral = not yet).
import { Avatar } from "./ui";
import { Globe, Check } from "./icons";

export interface RadialNode {
  id: string;
  label: string; // shown under the avatar (name, or short address)
  sub?: string;
  tone: "verified" | "attester" | "open" | "real" | "placeholder";
  dashed?: boolean;
  address?: string; // for the Circles avatar lookup / initials fallback
  name?: string | null; // real profile name (initials fallback when no picture)
  imageUrl?: string | null; // Circles profile picture
}

type ToneStyle = { card: string; ring: string; badge: boolean; navy: boolean };
const TONE: Record<RadialNode["tone"], ToneStyle> = {
  attester: { card: "border-[#194383]", ring: "ring-2 ring-[#194383]", badge: true, navy: true },
  real: { card: "border-[#194383]", ring: "ring-2 ring-[#194383]", badge: true, navy: true },
  verified: { card: "border-[#194383]/30", ring: "ring-2 ring-[#194383]/40", badge: false, navy: true },
  open: { card: "border-dashed border-neutral-300", ring: "ring-1 ring-neutral-200", badge: false, navy: false },
  placeholder: { card: "border-dashed border-neutral-300", ring: "ring-1 ring-neutral-200", badge: false, navy: false },
};

const TONE_RANK: Record<RadialNode["tone"], number> = { attester: 0, real: 0, verified: 1, open: 2, placeholder: 3 };

// Polar position (units where 50 = the half-width of the square) per node index.
function layout(n: number): { x: number; y: number; r: number }[] {
  if (n <= 0) return [];
  const place = (count: number, idx: number, radius: number, offset = 0) => {
    const a = (idx / count) * 2 * Math.PI - Math.PI / 2 + offset;
    return { x: 50 + radius * Math.cos(a), y: 50 + radius * Math.sin(a), r: radius };
  };
  if (n <= 7) return Array.from({ length: n }, (_, i) => place(n, i, 34));
  const inner = Math.min(6, Math.round(n * 0.4));
  const outer = n - inner;
  return [
    ...Array.from({ length: inner }, (_, i) => place(inner, i, 21)),
    ...Array.from({ length: outer }, (_, i) => place(outer, i, 38, Math.PI / outer)),
  ];
}

export default function RadialGraph({
  center,
  nodes,
  emptyLabel = "no members yet",
}: {
  center: { label: string; sub?: string; imageUrl?: string | null };
  nodes: RadialNode[];
  emptyLabel?: string;
}) {
  // Attesters / live towns gravitate to the inner ring.
  const ordered = [...nodes].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
  const pts = layout(ordered.length);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[400px]">
      {/* Edge layer (behind the cards) */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden>
        <circle cx="50" cy="50" r="38" fill="none" stroke="#ededed" strokeWidth="0.4" />
        <circle cx="50" cy="50" r="21" fill="none" stroke="#f5f5f5" strokeWidth="0.4" />
        {pts.map((p, i) => {
          const nd = ordered[i];
          const navy = TONE[nd.tone].navy;
          return (
            <line
              key={`e-${nd.id}`}
              x1="50"
              y1="50"
              x2={p.x}
              y2={p.y}
              stroke={navy ? "#194383" : "#D4D4D4"}
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeDasharray={nd.dashed ? "1.6 1.6" : `${p.r}`}
              className={nd.dashed ? undefined : "rc-draw"}
              style={
                nd.dashed
                  ? { opacity: 0.45 }
                  : ({ ["--rc-len" as string]: `${p.r}`, animation: `rc-draw 0.9s ${0.15 + i * 0.03}s ease-out both`, opacity: 0.55 } as React.CSSProperties)
              }
            />
          );
        })}
      </svg>

      {/* Member cards */}
      {pts.map((p, i) => {
        const nd = ordered[i];
        const t = TONE[nd.tone];
        return (
          <div
            key={nd.id}
            className="rc-rise absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${0.2 + i * 0.03}s` }}
          >
            <div
              className={`flex w-[74px] flex-col items-center gap-1 rounded-[10px] border bg-card px-1.5 py-1.5 shadow-sm transition-transform duration-200 hover:scale-105 ${t.card}`}
            >
              <div className="relative">
                <Avatar address={nd.address ?? nd.id} name={nd.name ?? null} imageUrl={nd.imageUrl ?? null} size={34} className={t.ring} />
                {t.badge && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#194383] text-white ring-2 ring-card">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
              <span className="max-w-full truncate text-center text-[10px] font-medium leading-tight text-foreground">{nd.label}</span>
              {nd.sub && <span className="max-w-full truncate text-center text-[9px] leading-none text-muted-foreground">{nd.sub}</span>}
            </div>
          </div>
        );
      })}

      {/* Center (the group / meta-group) */}
      <div className="rc-rise absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-[12px] border-2 border-[#194383] bg-[#194383] px-3 py-2 text-center text-white shadow-md">
        {center.imageUrl ? (
          <img src={center.imageUrl} alt="" className="h-9 w-9 rounded-full border border-white/30 bg-white object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <Globe className="h-5 w-5" />
          </span>
        )}
        <span className="max-w-[96px] truncate text-[11px] font-bold leading-tight">{center.label}</span>
        {center.sub && <span className="text-[9px] font-medium text-white/70">{center.sub}</span>}
      </div>

      {ordered.length === 0 && (
        <div className="absolute inset-x-0 bottom-6 text-center text-[11px] text-muted-foreground">{emptyLabel}</div>
      )}
    </div>
  );
}
