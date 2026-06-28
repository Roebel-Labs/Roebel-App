"use client";
import { useEffect, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink } from "lucide-react";
import { HistorySkeleton } from "./skeletons";
import { initials } from "./MemberRow";

interface Signer { address: string; name: string; avatarUrl: string | null }
interface Tx { safeTxHash: string; title: string; date: string | null; transactionHash: string | null; signers: Signer[]; counterparty: { name: string; avatarUrl: string | null } | null }

export function Verlauf() {
  const [items, setItems] = useState<Tx[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/gemeinschaftskasse/history").then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setItems(d.items))).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!items) return <HistorySkeleton />;
  if (!items.length) return <p className="text-sm text-muted-foreground">Noch keine Vorgänge.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((t) => (
        <li key={t.safeTxHash} className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm truncate">{t.title}</p>
            <div className="flex items-center gap-2 mt-1">
              {t.date && <span className="text-xs text-muted-foreground">{new Date(t.date).toLocaleString("de-DE")}</span>}
              {t.signers.length > 0 && (
                <span className="flex -space-x-1.5">
                  {t.signers.slice(0, 4).map((s) => (
                    <Avatar key={s.address} className="h-5 w-5 border border-background">
                      {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
                      <AvatarFallback className="text-[9px]">{initials(s.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                </span>
              )}
            </div>
          </div>
          {t.transactionHash && (
            <a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0" href={`https://gnosisscan.io/tx/${t.transactionHash}`} target="_blank" rel="noreferrer">
              Gnosisscan <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
