// Pulse — the town's Röbel Münzen economy at a glance: a reputation ranking (held RCRC +
// flow activity) and a filterable feed of all token flows (mint / reward / lootbox / transfer).
import { useEffect, useMemo, useState } from "react";
import {
  getVerifiedSet,
  getRecentTransfers,
  getReputation,
  flowLabel,
  type Transfer,
  type FlowKind,
  type RepNode,
} from "../lib/circlesData";
import { shortAddr, explorerTx, explorerAvatar } from "../lib/citizens";

const KINDS: (FlowKind | "all")[] = ["all", "mint", "reward", "spend", "transfer"];
const KIND_COLOR: Record<FlowKind, string> = {
  mint: "bg-emerald-100 text-emerald-700",
  reward: "bg-sky-100 text-sky-700",
  spend: "bg-amber-100 text-amber-700",
  transfer: "bg-slate-100 text-slate-600",
};

const Skeleton = () => <div className="h-24 animate-pulse rounded-lg bg-slate-100" />;
const Empty = () => <p className="text-xs text-slate-400">Noch keine Daten.</p>;

export default function PulseView() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [rep, setRep] = useState<RepNode[] | null>(null);
  const [filter, setFilter] = useState<FlowKind | "all">("all");

  const load = async () => {
    setTransfers(null);
    setRep(null);
    const verified = await getVerifiedSet().catch(() => new Set<string>());
    const [tf, rp] = await Promise.all([getRecentTransfers(40), getReputation(verified)]);
    setTransfers(tf);
    setRep(rp);
  };
  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () => (transfers ?? []).filter((t) => filter === "all" || t.kind === filter),
    [transfers, filter],
  );
  const maxScore = useMemo(() => Math.max(1, ...(rep ?? []).map((r) => r.score)), [rep]);

  return (
    <div className="space-y-6">
      {/* Reputation ranking */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Reputation</h2>
          <button onClick={load} className="text-xs font-medium text-navy hover:underline">
            Refresh
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-400">
          Aktivität im Netzwerk — gehaltene RCRC + Ein-/Ausgänge. Grün = verifizierte:r Bürger:in.
        </p>
        {rep === null ? (
          <Skeleton />
        ) : rep.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {rep.slice(0, 12).map((n) => (
              <a key={n.address} href={explorerAvatar(n.address)} target="_blank" rel="noreferrer" className="block">
                <div className="mb-0.5 flex items-center gap-2 text-xs">
                  <span className={`h-2 w-2 rounded-full ${n.verified ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <span className="font-medium text-slate-700">{shortAddr(n.address)}</span>
                  <span className="text-slate-400">
                    · {n.held.toFixed(0)} RCRC · {n.inCount}↓ {n.outCount}↑
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-navy" style={{ width: `${Math.max(4, (n.score / maxScore) * 100)}%` }} />
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Filterable token-flow feed */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Token-Flüsse</h2>
        <div className="mb-3 flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === k ? "bg-navy text-white" : "bg-slate-100 text-slate-500 hover:text-slate-700"
              }`}
            >
              {k === "all" ? "Alle" : flowLabel(k as FlowKind)}
            </button>
          ))}
        </div>
        {transfers === null ? (
          <Skeleton />
        ) : filtered.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-1.5">
            {filtered.map((t, i) => (
              <a
                key={t.tx + i}
                href={explorerTx(t.tx)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_COLOR[t.kind]}`}>
                    {flowLabel(t.kind)}
                  </span>
                  <span className="truncate text-xs text-slate-500">
                    {shortAddr(t.from)} → {shortAddr(t.to)}
                  </span>
                </div>
                <span className="text-xs font-semibold tabular-nums text-slate-700">{t.amount.toFixed(2)}</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
