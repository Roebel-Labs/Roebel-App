import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function Banner({
  kind,
  children,
  className = "",
}: {
  kind: "ok" | "err" | "info";
  children: ReactNode;
  className?: string;
}) {
  const tone =
    kind === "ok"
      ? "border-green-200 bg-green-50 text-green-800"
      : kind === "err"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tone} ${className}`}>{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="py-10 text-center text-sm text-slate-400">{label}</div>;
}
