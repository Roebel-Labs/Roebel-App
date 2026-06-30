"use client";
import { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { ExternalLink, Users, ShieldCheck, Clock, ArrowUpRight } from "lucide-react";
import { MemberRow } from "./MemberRow";
import { BalanceSkeleton, OwnerListSkeleton } from "./skeletons";
import { Explainer } from "./ui/Explainer";
import { InfoTooltip } from "./ui/InfoTooltip";
import type { TxView } from "@/lib/gemeinschaftskasse/constants";

interface Asset { id: string; label: string; amount: number; eur: number | null; sharePct: number | null; redeemable: boolean }
interface Owner { address: string; name: string; short: string; isYou?: boolean; avatarUrl: string | null; username: string | null; verified: boolean }
interface Overview { owners: Owner[]; assets: Asset[]; euroTotal: number; threshold: number; ownerCount: number; nonce: number; safeAddress: string; safeVersion: string }

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const num = (n: number, d = 2) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d }).format(n);

export function Uebersicht() {
  const account = useActiveAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<TxView[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const url = "/api/gemeinschaftskasse/overview" + (account ? `?you=${account.address}` : "");
    fetch(url).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(String(e)));
    fetch("/api/gemeinschaftskasse/pending").then((r) => r.json()).then((d) => setPendingCount(Array.isArray(d.items) ? d.items.length : 0)).catch(() => setPendingCount(0));
    fetch("/api/gemeinschaftskasse/history").then((r) => r.json()).then((d) => Array.isArray(d.items) && setRecent(d.items.slice(0, 3))).catch(() => {});
  }, [account]);

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!data)
    return (
      <div className="space-y-6">
        <BalanceSkeleton />
        <div className="rounded-lg border border-border p-5">
          <OwnerListSkeleton />
        </div>
      </div>
    );

  const youAreOwner = data.owners.some((o) => o.isYou);

  return (
    <div className="space-y-6">
      {/* Treasury hero */}
      <div className="rounded-xl border border-[#00498B] bg-gradient-to-br from-[#00498B] to-[#00366a] p-6 text-white">
        <p className="text-sm text-white/70">Reserve der Gemeinschaftskasse</p>
        <p className="mt-1 text-4xl font-bold tracking-tight">{eur(data.euroTotal)}</p>
        <p className="mt-1 text-xs text-white/60">in € einlösbar (xDAI + EURe) · Röbel-Münzen separat</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span><span className="text-white/60">Mitsignierer</span> <strong>{data.ownerCount}</strong></span>
          <span><span className="text-white/60">Schwelle</span> <strong>{data.threshold} von {data.ownerCount}</strong></span>
          <span><span className="text-white/60">Offen</span> <strong>{pendingCount ?? "…"}</strong></span>
          <span><span className="text-white/60">Vorgänge</span> <strong>{data.nonce}</strong></span>
        </div>
      </div>

      {/* Holdings */}
      <div className="rounded-xl border border-border p-5">
        <p className="mb-3 text-sm font-medium">Guthaben</p>
        <ul className="space-y-3">
          {data.assets.map((a) => (
            <li key={a.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {a.label}
                  {!a.redeemable && <span className="ml-2 text-xs text-muted-foreground">(nicht in € einlösbar)</span>}
                </span>
                <span className="text-right">
                  <span className="font-medium tabular-nums">{num(a.amount)}</span>
                  {a.eur != null && <span className="text-muted-foreground"> · {eur(a.eur)}</span>}
                </span>
              </div>
              {a.sharePct != null && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#00498B]" style={{ width: `${Math.max(2, a.sharePct)}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm font-semibold">
          <span>€-Reserve gesamt</span>
          <span>{eur(data.euroTotal)}</span>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Mitsignierer" value={String(data.ownerCount)} sub="können freigeben" />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label={<>Schwelle <InfoTooltip text={`Mindestens ${data.threshold} der ${data.ownerCount} Mitsignierer müssen freigeben, bevor Geld bewegt wird.`} /></>}
          value={`${data.threshold}/${data.ownerCount}`}
          sub="Freigaben nötig"
        />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Offene Vorgänge" value={pendingCount != null ? String(pendingCount) : "…"} sub="warten auf Freigaben" />
      </div>

      {data.threshold < 2 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Sicherheitshinweis: Aktuell kann eine einzelne Person allein Geld bewegen. Erhöhe die Freigabe-Schwelle unter
          „Mitglieder“ auf mindestens 2.
        </div>
      )}

      {/* Signers */}
      <div className="rounded-xl border border-border p-5">
        <p className="mb-3 text-sm font-medium">Mitsignierer ({data.owners.length})</p>
        <ul className="space-y-3">
          {data.owners.map((o) => (
            <li key={o.address} className="flex items-center justify-between gap-3">
              <MemberRow m={o} />
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{o.short}</span>
            </li>
          ))}
        </ul>
        {youAreOwner && <p className="mt-3 text-xs font-medium text-[#00498B]">✓ Du bist Mitsignierer.</p>}
      </div>

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="rounded-xl border border-border p-5">
          <p className="mb-1 text-sm font-medium">Letzte Vorgänge</p>
          <ul className="divide-y divide-border">
            {recent.map((t) => (
              <li key={t.safeTxHash} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="text-base" aria-hidden>{t.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm">{t.title}</p>
                    {t.date && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.date).toLocaleDateString("de-DE", { dateStyle: "medium" })}
                      </p>
                    )}
                  </div>
                </div>
                {t.transactionHash && (
                  <a className="shrink-0 text-muted-foreground hover:text-foreground" href={`https://gnosisscan.io/tx/${t.transactionHash}`} target="_blank" rel="noreferrer">
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Explainer title="Was ist die Gemeinschaftskasse?">
        <p>
          Das gemeinsame Konto der Stadt — verwaltet von mehreren Personen über ein <strong>Multisig-Wallet</strong> auf
          der Gnosis-Blockchain.
        </p>
        <p>
          Ein Multisig ist wie ein Tresor mit mehreren Schlüsseln: Geld bewegt sich erst, wenn genug Mitsignierer
          ({data.threshold} von {data.ownerCount}) zustimmen. Das macht jeden Vorgang öffentlich nachprüfbar.
        </p>
        <p>
          <a className="inline-flex items-center gap-1 text-[#00498B] hover:underline" href={`https://gnosisscan.io/address/${data.safeAddress}`} target="_blank" rel="noreferrer">
            Konto auf Gnosisscan ansehen <ExternalLink className="h-3 w-3" />
          </a>{" "}
          · Safe {data.safeVersion}
        </p>
      </Explainer>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: React.ReactNode; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
