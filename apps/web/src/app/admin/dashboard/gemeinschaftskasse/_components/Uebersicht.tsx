"use client";
import { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { MemberRow } from "./MemberRow";
import { BalanceSkeleton, OwnerListSkeleton } from "./skeletons";

interface Asset { id: string; label: string; amount: number; eur: number | null; sharePct: number | null; redeemable: boolean }
interface Owner { address: string; name: string; short: string; isYou?: boolean; avatarUrl: string | null; username: string | null; verified: boolean }
interface Overview { owners: Owner[]; assets: Asset[]; euroTotal: number; threshold: number; ownerCount: number; nonce: number; safeAddress: string; safeVersion: string }

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const num = (n: number, d = 2) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d }).format(n);

export function Uebersicht() {
  const account = useActiveAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const url = "/api/gemeinschaftskasse/overview" + (account ? `?you=${account.address}` : "");
    fetch(url).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(String(e)));
  }, [account]);

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!data) return (
    <div className="space-y-6"><BalanceSkeleton /><div className="rounded-lg border border-border p-5"><OwnerListSkeleton /></div></div>
  );

  const youAreOwner = data.owners.some((o) => o.isYou);
  return (
    <div className="space-y-6">
      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Reserve" value={eur(data.euroTotal)} />
        <Stat label="Mitsignierer" value={String(data.ownerCount)} />
        <Stat label="Freigaben nötig" value={`${data.threshold} von ${data.ownerCount}`} />
        <Stat label="Transaktionen" value={String(data.nonce)} />
      </div>

      {/* Holdings */}
      <div className="rounded-lg border border-border p-5">
        <p className="text-sm font-medium mb-3">Guthaben</p>
        <ul className="space-y-2">
          {data.assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span>{a.label}{!a.redeemable && <span className="ml-2 text-xs text-muted-foreground">(nicht in € einlösbar)</span>}</span>
              <span className="text-right">
                <span className="font-medium">{num(a.amount)}</span>
                {a.eur != null && <span className="text-muted-foreground"> · {eur(a.eur)}{a.sharePct != null ? ` · ${num(a.sharePct, 0)}%` : ""}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-medium">
          <span>€-Reserve gesamt</span><span>{eur(data.euroTotal)}</span>
        </div>
      </div>

      {/* Owners */}
      <div className="rounded-lg border border-border p-5">
        <p className="text-sm font-medium mb-3">Mitsignierer ({data.owners.length})</p>
        <ul className="space-y-3">
          {data.owners.map((o) => (
            <li key={o.address} className="flex items-center justify-between gap-3">
              <MemberRow m={o} />
              <span className="text-xs text-muted-foreground font-mono shrink-0">{o.short}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground mt-4">Aktuell genügen <strong>{data.threshold}</strong> von {data.ownerCount} Freigaben für eine Auszahlung.</p>
        {data.threshold < 2 && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">Sicherheitshinweis: Aktuell kann eine einzelne Person allein Geld bewegen. Erhöhe die Freigabe-Schwelle unter „Mitglieder" auf mindestens 2.</div>
        )}
        {youAreOwner && <p className="mt-2 text-xs text-[#00498B]">Du bist Mitsignierer.</p>}
      </div>

      {/* Safe meta */}
      <p className="text-xs text-muted-foreground">
        Safe {data.safeVersion} ·{" "}
        <a className="hover:underline" href={`https://gnosisscan.io/address/${data.safeAddress}`} target="_blank" rel="noreferrer">auf Gnosisscan ansehen</a>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
    </div>
  );
}
