// Shadcn-flavoured UI primitives for the Röbel Circles mini-app — mirrors the admin
// "Münzen" dashboard (navy, 10px radius, soft borders, KPI tiles, pills, identity cells).
import { useState, type ReactNode } from "react";
import { explorerAvatar } from "../lib/citizens";
import { shortAddr } from "../lib/format";
import { Refresh, ArrowUpRight, Check } from "./icons";

// The app keeps a `tone` API across its KPIs / pills / cells, but the palette is
// reduced to two values: navy (the single accent, for the primary metric) and
// neutral gray (everything else). No green/amber/red/sky/violet.
export type Tone = "primary" | "success" | "warning" | "danger" | "info" | "violet" | "muted";

const TONE_BAR: Record<Tone, string> = {
  primary: "bg-[#00498B]",
  success: "bg-neutral-200",
  warning: "bg-neutral-200",
  danger: "bg-neutral-200",
  info: "bg-neutral-200",
  violet: "bg-neutral-200",
  muted: "bg-neutral-200",
};

const TONE_TEXT: Record<Tone, string> = {
  primary: "text-[#00498B]",
  success: "text-muted-foreground",
  warning: "text-muted-foreground",
  danger: "text-muted-foreground",
  info: "text-muted-foreground",
  violet: "text-muted-foreground",
  muted: "text-muted-foreground",
};

const TONE_PILL: Record<Tone, string> = {
  primary: "bg-[#00498B]/10 text-[#00498B]",
  success: "bg-muted text-muted-foreground",
  warning: "bg-muted text-muted-foreground",
  danger: "bg-muted text-muted-foreground",
  info: "bg-muted text-muted-foreground",
  violet: "bg-muted text-muted-foreground",
  muted: "bg-muted text-muted-foreground",
};

/* ── Card ──────────────────────────────────────────────────────────────────── */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[10px] border border-border bg-card shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

/** Card wrapper for a chart / table: title + optional subtitle + action slot. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className = "",
  style,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card className={className}>
      <div className="p-4" style={style}>
        {(title || action) && (
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              {title && <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </Card>
  );
}

/* ── Page header ───────────────────────────────────────────────────────────── */
export function PageHeader({
  title,
  description,
  onRefresh,
  refreshing,
}: {
  title: string;
  description?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground active:scale-[0.97]"
        >
          <Refresh className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      )}
    </div>
  );
}

/* ── KPI tile ──────────────────────────────────────────────────────────────── */
export function KpiCard({
  label,
  value,
  sub,
  tone = "primary",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-stretch">
        <div className={`w-1 shrink-0 ${TONE_BAR[tone]}`} />
        <div className="flex flex-1 items-start justify-between gap-2 p-3.5">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-foreground tnum">{value}</div>
            {sub != null && <div className="mt-1.5 text-[11px] text-muted-foreground">{sub}</div>}
          </div>
          {icon && <div className={`shrink-0 ${TONE_TEXT[tone]}`}>{icon}</div>}
        </div>
      </div>
    </Card>
  );
}

/* ── Pill / badge ──────────────────────────────────────────────────────────── */
export function Pill({ tone = "muted", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_PILL[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ── Identity cell (avatar + address) ──────────────────────────────────────── */
export function IdentityCell({
  address,
  tone = "muted",
  right,
  link = true,
}: {
  address: string;
  tone?: Tone;
  right?: ReactNode;
  link?: boolean;
}) {
  const inner = (
    <div className="flex min-w-0 items-center gap-2.5">
      <img
        src={explorerAvatar(address)}
        alt=""
        loading="lazy"
        className={`h-7 w-7 shrink-0 rounded-full border border-border bg-muted object-cover`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <div className="min-w-0">
        <div className="truncate font-mono text-[13px] font-medium leading-tight text-foreground">{shortAddr(address)}</div>
      </div>
      <span className={`ml-auto ${TONE_TEXT[tone]}`}>{right}</span>
    </div>
  );
  if (!link) return inner;
  return (
    <a href={explorerAvatar(address)} target="_blank" rel="noreferrer" className="block">
      {inner}
    </a>
  );
}

/* ── Avatar (real Circles profile picture, with initials placeholder) ────────── */
// Deterministic placeholder shades — keyed off the address so a wallet without an
// uploaded picture always gets the same colour. Kept strictly within the app's
// two families (navy accent + neutral gray) — no off-palette hues.
const AVATAR_BG = ["#00498B", "#27508c", "#355d95", "#1e3a5f", "#475569", "#334155"];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}
function initials(name: string | null, address: string): string {
  const n = name?.trim();
  if (n) {
    const parts = n.split(/\s+/);
    const two = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[1]?.[0] ?? "" : "");
    return (two || n.slice(0, 2)).toUpperCase();
  }
  return address.replace(/^0x/, "").slice(0, 2).toUpperCase();
}

/**
 * Circles avatar: the on-chain profile picture when available, otherwise a
 * deterministic initials placeholder (name initials, or the address head).
 */
export function Avatar({
  address,
  name = null,
  imageUrl = null,
  size = 28,
  className = "",
}: {
  address: string;
  name?: string | null;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const px = `${size}px`;
  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt={name ?? ""}
        loading="lazy"
        onError={() => setBroken(true)}
        style={{ width: px, height: px }}
        className={`shrink-0 rounded-full border border-border bg-muted object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: px, height: px, backgroundColor: avatarColor(address.toLowerCase()), fontSize: Math.round(size * 0.4) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white ${className}`}
    >
      {initials(name, address)}
    </span>
  );
}

/* ── Banner / alert ────────────────────────────────────────────────────────── */
export function Banner({
  kind,
  children,
  className = "",
}: {
  kind: "ok" | "err" | "info" | "warn";
  children: ReactNode;
  className?: string;
}) {
  // One neutral treatment for every kind — errors stand out by a darker left
  // rule and near-black text rather than by colour.
  const emphatic = kind === "err" || kind === "warn";
  const tone = emphatic
    ? "border-border border-l-2 border-l-foreground bg-muted text-foreground"
    : "border-border bg-muted text-muted-foreground";
  return <div className={`rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-relaxed ${tone} ${className}`}>{children}</div>;
}

/* ── Score / progress bar ──────────────────────────────────────────────────── */
/* Always navy fill — progress is the natural home for the single accent. The
   `tone` arg is accepted for call-site compatibility but no longer varies hue. */
export function ScoreBar({ value, tone: _tone = "primary" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-[#00498B] transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(3, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ── Loading / empty / skeleton ────────────────────────────────────────────── */
export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[10px] border border-border bg-muted/50 ${className}`} />;
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[74px]" />
      ))}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[6rem] items-center justify-center rounded-[10px] border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}

/* ── Section heading (inside cards) ────────────────────────────────────────── */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{children}</h3>
      {right}
    </div>
  );
}

/* ── External-link chip ────────────────────────────────────────────────────── */
export function LinkChip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-[#00498B] transition hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

export { Check };
