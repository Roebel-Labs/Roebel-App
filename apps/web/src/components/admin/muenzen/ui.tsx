"use client";

import * as React from "react";
import {
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { shortAddr } from "@/lib/muenzen/constants";
import { timeAgo } from "./format";

/** Page header with title, description, last-updated stamp and refresh button. */
export function PageHeader({
  title,
  description,
  generatedAt,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  description?: string;
  generatedAt?: number | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {generatedAt != null && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Stand: {timeAgo(generatedAt)}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Aktualisieren
          </button>
        )}
      </div>
    </div>
  );
}

const TONE_BAR: Record<string, string> = {
  primary: "bg-[#00498B]",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
  muted: "bg-slate-300",
};

/** Compact KPI card with a colored accent bar. */
export function KpiCard({
  label,
  value,
  sub,
  tone = "primary",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: keyof typeof TONE_BAR;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className={cn("absolute inset-y-0 left-0 w-1", TONE_BAR[tone])} />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {icon && <div className="shrink-0 text-muted-foreground">{icon}</div>}
      </div>
    </Card>
  );
}

/** Card wrapper for a chart/table with a title row. */
export function ChartCard({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

const PILL: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  info: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  muted: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function Pill({
  tone = "muted",
  children,
}: {
  tone?: keyof typeof PILL;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", PILL[tone])}>
      {children}
    </span>
  );
}

/** Copyable short address (secondary identity per the name-first rule). */
export function AddressTag({ address }: { address: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      title={address}
      onClick={() => {
        navigator.clipboard?.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {shortAddr(address)}
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  );
}

/** Name-first identity cell: avatar + display name, with the address as a small secondary. */
export function IdentityCell({
  name,
  address,
  avatarUrl,
  fallback = "Bürger:in",
}: {
  name?: string | null;
  address: string;
  avatarUrl?: string | null;
  fallback?: string;
}) {
  const display = name || fallback;
  const initial = display.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00498B]/10 text-xs font-semibold text-[#00498B]">
          {initial}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{display}</p>
        <AddressTag address={address} />
      </div>
    </div>
  );
}

export function AlertBanner({
  alerts,
}: {
  alerts: { level: "warning" | "info"; key: string; message: string }[];
}) {
  if (!alerts?.length) return null;
  return (
    <div className="mb-6 space-y-2">
      {alerts.map((a) => (
        <div
          key={a.key}
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
            a.level === "warning"
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              : "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
          )}
        >
          {a.level === "warning" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

export function HealthDot({ level }: { level: "ok" | "warning" }) {
  return level === "ok" ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  ) : (
    <AlertTriangle className="h-4 w-4 text-amber-500" />
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[8rem] items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" /> Fehler beim Laden
      </div>
      <p className="mt-1 break-words">{error}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-red-300 px-2 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-800"
        >
          Erneut versuchen
        </button>
      )}
    </Card>
  );
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-[10px] border border-border bg-muted/40" />
      ))}
    </div>
  );
}
