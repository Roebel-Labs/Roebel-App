import { Clock, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { TxStatus } from "@/lib/gemeinschaftskasse/constants";

export type BadgeStatus = TxStatus | "wird_ausgefuehrt";

const MAP: Record<BadgeStatus, { label: string; cls: string; Icon: typeof Clock; spin?: boolean }> = {
  wartet: { label: "Wartet auf Freigaben", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
  bereit: { label: "Bereit zur Ausführung", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  wird_ausgefuehrt: { label: "Wird ausgeführt", cls: "bg-sky-50 text-sky-700 border-sky-200", Icon: Loader2, spin: true },
  ausgefuehrt: { label: "Ausgeführt", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  fehlgeschlagen: { label: "Fehlgeschlagen", cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
};

export function StatusBadge({ status, n, m }: { status: BadgeStatus; n?: number; m?: number }) {
  const s = MAP[status];
  const showCount = (status === "wartet" || status === "bereit") && n != null && m != null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      <s.Icon className={`h-3.5 w-3.5 ${s.spin ? "animate-spin" : ""}`} />
      {s.label}
      {showCount ? ` · ${n}/${m}` : ""}
    </span>
  );
}
