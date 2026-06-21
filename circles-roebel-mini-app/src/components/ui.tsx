// Shadcn-flavoured UI primitives for the Röbel Circles mini-app — mirrors the admin
// "Münzen" dashboard (navy, 10px radius, soft borders, KPI tiles, pills, identity cells).
import type { ReactNode } from "react";
import { explorerAvatar } from "../lib/citizens";
import { shortAddr } from "../lib/format";
import { Refresh, ArrowUpRight, Check } from "./icons";

export type Tone = "primary" | "success" | "warning" | "danger" | "info" | "violet" | "muted";

const TONE_BAR: Record<Tone, string> = {
  primary: "bg-[#194383]",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
  violet: "bg-violet-500",
  muted: "bg-slate-300",
};

const TONE_TEXT: Record<Tone, string> = {
  primary: "text-[#194383]",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  info: "text-sky-600",
  violet: "text-violet-600",
  muted: "text-slate-500",
};

const TONE_PILL: Record<Tone, string> = {
  primary: "bg-[#194383]/10 text-[#194383]",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-700",
  violet: "bg-violet-100 text-violet-700",
  muted: "bg-slate-100 text-slate-600",
};

/* ── Card ──────────────────────────────────────────────────────────────────── */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)] ${className}`}
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
  const tone =
    kind === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : kind === "err"
        ? "border-red-200 bg-red-50 text-red-700"
        : kind === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800";
  return <div className={`rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-relaxed ${tone} ${className}`}>{children}</div>;
}

/* ── Score / progress bar ──────────────────────────────────────────────────── */
export function ScoreBar({ value, tone = "primary" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${TONE_BAR[tone]} transition-[width] duration-700 ease-out`}
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
      className="inline-flex items-center gap-1 text-xs font-medium text-[#194383] transition hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

export { Check };
