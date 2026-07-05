// CSV export of the town's Röbel-Münzen activity (moved here from the Gemeinde tab —
// it is economy data). Delivers the file the most reliable way the host allows and
// falls back to an in-app copy/preview sheet when downloads + share are both blocked.
import { useState } from "react";
import { getRecentTransfers, type RepNode } from "../../lib/circlesData";
import type { Citizen } from "../../lib/citizens";
import { toCsv, exportCsv, todayStamp } from "../../lib/csv";
import { track } from "../../lib/analytics";
import { ChartCard } from "../../components/ui";
import { Download, Check } from "../../components/icons";
import CsvFallbackSheet from "../../components/CsvFallbackSheet";

export function ExportCard({
  verifiedSet,
  rep,
  citizens,
}: {
  verifiedSet: Set<string>;
  rep: RepNode[] | null;
  citizens: Citizen[];
}) {
  const [range, setRange] = useState<"7d" | "all">("7d");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fallback, setFallback] = useState<{ filename: string; csv: string } | null>(null);

  const deliver = async (kind: string, filename: string, csv: string, extra: Record<string, unknown> = {}) => {
    if (!csv) {
      setToast("Nichts zu exportieren");
      setTimeout(() => setToast(null), 1800);
      track("csv_export", { kind, rows: 0, empty: true, ...extra });
      return;
    }
    const res = await exportCsv(filename, csv);
    track("csv_export", { kind, method: res, ...extra });
    if (res === "fallback") {
      setFallback({ filename, csv });
    } else if (res === "shared" || res === "downloaded") {
      setToast(res === "shared" ? "Geteilt ✓" : "Heruntergeladen ✓");
      setTimeout(() => setToast(null), 1800);
    }
  };

  const run = (kind: string, fn: () => Promise<void> | void) => async () => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const exportTransfers = run("transfers", async () => {
    const all = await getRecentTransfers(200);
    const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
    const rows = all
      .filter((t) => (range === "all" ? true : t.time >= cutoff))
      .map((t) => ({
        date: t.time ? new Date(t.time * 1000).toISOString() : "",
        kind: t.kind,
        from: t.from,
        to: t.to,
        amount: t.amount,
        tx: t.tx,
      }));
    await deliver("transfers", `roebel-uebertragungen-${todayStamp()}.csv`, toCsv(rows, ["date", "kind", "from", "to", "amount", "tx"]), {
      rows: rows.length,
      range,
    });
  });

  const exportCitizens = run("citizens", async () => {
    const rows = citizens.map((c) => ({ address: c.address, attester: c.attester, verified: verifiedSet.has(c.address.toLowerCase()) }));
    await deliver("citizens", `roebel-buerger-${todayStamp()}.csv`, toCsv(rows, ["address", "attester", "verified"]), { rows: rows.length });
  });

  const exportReputation = run("reputation", async () => {
    const rows = (rep ?? []).map((r, i) => ({
      rank: i + 1,
      address: r.address,
      held: r.held,
      inCount: r.inCount,
      outCount: r.outCount,
      score: r.score,
      verified: r.verified,
    }));
    await deliver("reputation", `roebel-ansehen-${todayStamp()}.csv`, toCsv(rows, ["rank", "address", "held", "inCount", "outCount", "score", "verified"]), {
      rows: rows.length,
    });
  });

  const btn =
    "inline-flex items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground transition hover:bg-muted active:scale-[0.99] disabled:opacity-50";

  return (
    <>
      <ChartCard
        title="Daten exportieren"
        subtitle="Lade die Aktivität der Gemeinde als CSV herunter."
        action={
          <div className="flex rounded-[10px] border border-border p-0.5">
            {(["7d", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-[7px] px-2 py-1 text-[11px] font-medium transition ${range === r ? "bg-[#00498B] text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {r === "7d" ? "Letzte 7 Tage" : "Alle"}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <button onClick={exportTransfers} disabled={!!busy} className={btn}>
            <Download className="h-4 w-4" />
            {busy === "transfers" ? "…" : "Übertragungen"}
          </button>
          <button onClick={exportCitizens} disabled={!!busy} className={btn}>
            <Download className="h-4 w-4" />
            {busy === "citizens" ? "…" : "Bürger:innen"}
          </button>
          <button onClick={exportReputation} disabled={!!busy || !rep} className={btn}>
            <Download className="h-4 w-4" />
            {busy === "reputation" ? "…" : "Ansehen"}
          </button>
        </div>
        {toast ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#00498B]">
            <Check className="h-3.5 w-3.5" />
            {toast}
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">Übertragungen richten sich nach dem Zeitraum; Bürger:innen &amp; Ansehen sind eine Momentaufnahme.</p>
        )}
      </ChartCard>

      {fallback && <CsvFallbackSheet filename={fallback.filename} csv={fallback.csv} onClose={() => setFallback(null)} />}
    </>
  );
}
