// Client-safe formatting helpers for the Röbel Münzen console.
const nf2 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || Number.isNaN(n)) return "–";
  return (decimals === 0 ? nf0 : nf2).format(n);
}

/** Röbel Münzen amount with the RCRC unit (admin context — technical label OK). */
export function fmtRcrc(n: number | null | undefined, decimals = 2): string {
  return `${fmt(n, decimals)} RCRC`;
}

export function fmtEuro(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "–";
  return euro.format(n);
}

export function fmtPercent(ratio: number | null | undefined, decimals = 1): string {
  if (ratio == null || Number.isNaN(ratio)) return "–";
  return `${(ratio * 100).toFixed(decimals)} %`;
}

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "–";
  return new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(ms: number | null | undefined): string {
  if (!ms) return "–";
  return new Date(ms).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(ms: number | null | undefined): string {
  if (!ms) return "–";
  const diff = Date.now() - ms;
  if (diff < 0) return "gerade eben";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vor ${hrs} Std.`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `vor ${days} T.`;
  return fmtDate(ms);
}
