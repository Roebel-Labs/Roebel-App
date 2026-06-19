import { useCallback, useEffect, useState } from "react";
import { getRecentTransfers, type Transfer } from "../lib/circlesData";
import { Loading, Stat } from "../components/ui";
import { shortAddr, explorerAvatar, explorerTx } from "../lib/citizens";

const fmtAmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtTime = (t: number) =>
  t ? new Date(t * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export default function FlowView() {
  const [txs, setTxs] = useState<Transfer[] | null>(null);
  const load = useCallback(async () => {
    setTxs(null);
    setTxs(await getRecentTransfers(20));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">Röbel Münzen changing hands — circulation in the town.</p>
        <button onClick={load} className="text-xs text-navy hover:underline">Refresh</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="Recent transfers"><span className="text-xl font-semibold text-navy tabular-nums">{txs ? txs.length : "…"}</span></Stat>
        <Stat label="Volume (shown)"><span className="text-xl font-semibold text-slate-900 tabular-nums">{txs ? fmtAmt(txs.reduce((s, t) => s + t.amount, 0)) : "…"}</span></Stat>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        {txs === null ? (
          <Loading />
        ) : txs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No transfers yet — fills as citizens send Röbel Münzen.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {txs.map((t, i) => (
              <li key={t.tx + i} className="flex items-center gap-2 px-4 py-3 text-sm">
                <a href={explorerAvatar(t.from)} target="_blank" rel="noreferrer" className="font-mono text-xs text-slate-600 hover:underline">{shortAddr(t.from)}</a>
                <span className="text-slate-300">→</span>
                <a href={explorerAvatar(t.to)} target="_blank" rel="noreferrer" className="font-mono text-xs text-slate-600 hover:underline">{shortAddr(t.to)}</a>
                <span className="ml-auto font-semibold text-slate-900 tabular-nums">{fmtAmt(t.amount)}</span>
                <a href={explorerTx(t.tx)} target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 w-28 text-right hover:underline" title="Transaktion im Circles Explorer">{fmtTime(t.time)} ↗</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
