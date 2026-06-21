// Shared number / address / time formatters — English locale, used across the mini-app.

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const fmt = (n: number, max = 2) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: max });

export const fmtInt = (n: number) => Math.round(Number(n) || 0).toLocaleString("en-US");

export const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n) || 0);

export const pct = (ratio: number, decimals = 0) => `${((Number(ratio) || 0) * 100).toFixed(decimals)}%`;

/** Circles timestamps are unix seconds; accept seconds or ms and render "3h ago". */
export function timeAgo(ts: number): string {
  if (!ts) return "";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
