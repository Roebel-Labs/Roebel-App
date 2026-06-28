"use client";
import { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";

interface Overview {
  owners: { address: string; name: string; short: string; isYou?: boolean }[];
  threshold: number; euro: number;
  balances: { xdai: string; eure: string; muenzen: string };
}

export function Uebersicht() {
  const account = useActiveAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const url = "/api/gemeinschaftskasse/overview" + (account ? `?you=${account.address}` : "");
    fetch(url).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(String(e)));
  }, [account]);

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Lädt…</p>;

  const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(data.euro);
  const muenzen = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(data.balances.muenzen) / 1e18);
  const youAreOwner = data.owners.some((o) => o.isYou);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-5">
        <p className="text-sm text-muted-foreground">Guthaben (€-Reserve)</p>
        <p className="text-3xl font-semibold">{eur}</p>
        <p className="text-sm text-muted-foreground mt-1">+ {muenzen} Röbel-Münzen</p>
      </div>

      <div className="rounded-lg border border-border p-5">
        <p className="text-sm font-medium mb-3">Mitsignierer ({data.owners.length})</p>
        <ul className="space-y-2">
          {data.owners.map((o) => (
            <li key={o.address} className="flex items-center justify-between">
              <span className="text-sm">{o.name}{o.isYou && <span className="ml-2 text-xs text-[#00498B]">(Du)</span>}</span>
              <span className="text-xs text-muted-foreground font-mono">{o.short}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground mt-4">
          Aktuell genügen <strong>{data.threshold}</strong> von {data.owners.length} Freigaben für eine Auszahlung.
        </p>
        {data.threshold < 2 && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            Sicherheitshinweis: Aktuell kann eine einzelne Person allein Geld bewegen. Wir empfehlen, die Freigabe-Schwelle unter „Mitglieder" auf mindestens 2 zu erhöhen.
          </div>
        )}
        {youAreOwner && <p className="mt-2 text-xs text-[#00498B]">Du bist Mitsignierer.</p>}
      </div>
    </div>
  );
}
