"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { StatusBadge, type BadgeStatus } from "./StatusBadge";
import { SignerProgress } from "./SignerProgress";
import type { TxView } from "@/lib/gemeinschaftskasse/constants";

/** One transaction, richly presented: icon + decoded title + plain description,
 *  a status badge, the signer-progress strip (for open txs), an expandable
 *  technical detail row, and a slot for action buttons + inline feedback. */
export function TxCard({
  tx,
  youAddress,
  statusOverride,
  actions,
  feedback,
}: {
  tx: TxView;
  youAddress?: string;
  statusOverride?: BadgeStatus;
  actions?: React.ReactNode;
  feedback?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const badge: BadgeStatus = statusOverride ?? tx.status;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg" aria-hidden>
            {tx.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{tx.title}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{tx.description}</p>
          </div>
        </div>
        <StatusBadge status={badge} n={tx.confirmations} m={tx.threshold} />
      </div>

      {!tx.executed && (
        <div className="mt-4">
          <SignerProgress owners={tx.owners} threshold={tx.threshold} youAddress={youAddress} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {tx.date && (
            <span>{new Date(tx.date).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>
          )}
          <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 hover:text-foreground">
            Details
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <dl className="mt-3 grid grid-cols-1 gap-1.5 border-t border-border pt-3 text-xs">
          <Row k="Ziel-Adresse" v={tx.to} mono />
          {tx.amount && <Row k="Betrag" v={tx.amount} />}
          <Row k="Safe-Tx-Hash" v={tx.safeTxHash} mono />
          {tx.transactionHash && (
            <Row
              k="Transaktion"
              v={
                <a
                  className="inline-flex items-center gap-1 text-[#00498B] hover:underline"
                  href={`https://gnosisscan.io/tx/${tx.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Auf Gnosisscan ansehen ↗
                </a>
              }
            />
          )}
          {tx.rawData && <Row k="Calldata" v={`${tx.rawData.slice(0, 42)}…`} mono />}
        </dl>
      )}

      {feedback}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className={`break-all text-right ${mono ? "font-mono" : ""}`}>{v}</dd>
    </div>
  );
}
