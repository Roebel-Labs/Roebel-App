"use client";
import { useEffect, useState } from "react";

interface TxView { safeTxHash: string; title: string; submissionDate?: string }

export function Verlauf() {
  const [items, setItems] = useState<TxView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/gemeinschaftskasse/history").then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setItems(d.items))).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!items) return <p className="text-sm text-muted-foreground">Lädt…</p>;
  if (!items.length) return <p className="text-sm text-muted-foreground">Noch keine Vorgänge.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((t) => (
        <li key={t.safeTxHash} className="py-3 flex items-center justify-between">
          <span className="text-sm">{t.title}</span>
          <a className="text-xs text-muted-foreground hover:underline" href={`https://gnosisscan.io/tx/`} target="_blank" rel="noreferrer">
            {t.submissionDate ? new Date(t.submissionDate).toLocaleDateString("de-DE") : ""}
          </a>
        </li>
      ))}
    </ul>
  );
}
