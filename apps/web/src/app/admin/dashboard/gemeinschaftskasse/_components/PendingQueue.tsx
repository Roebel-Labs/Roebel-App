"use client";
import { useCallback, useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { Inbox } from "lucide-react";
import type { Account, Wallet } from "thirdweb/wallets";
import { confirmTx, executeTx } from "@/lib/gemeinschaftskasse/safe-client";
import type { TxView } from "@/lib/gemeinschaftskasse/constants";
import { HistorySkeleton } from "./skeletons";
import { useIsOwner } from "./useIsOwner";
import { useTxAction } from "./useTxAction";
import { TxCard } from "./ui/TxCard";
import { ActionFeedback } from "./ui/ActionFeedback";

interface PendingQueueProps {
  /** Bump to trigger a refetch from outside (e.g. after CreatePayout). */
  refreshKey?: number;
}

export function PendingQueue({ refreshKey }: PendingQueueProps) {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { isOwner } = useIsOwner();

  const [items, setItems] = useState<TxView[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch("/api/gemeinschaftskasse/pending")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setItems(d.items ?? []);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) return <HistorySkeleton />;
  if (err) return <p className="text-sm text-red-600">Fehler beim Laden: {err}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Ausstehende Transaktionen</h3>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">{items.length} offen</span>
        )}
      </div>

      {!isOwner && (
        <p className="text-sm text-muted-foreground">
          Nur Mitsignierer können freigeben oder ausführen — du kannst den Stand hier mitverfolgen.
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">Keine offenen Transaktionen</p>
          <p className="text-xs text-muted-foreground">
            Vorgeschlagene Auszahlungen erscheinen hier, bis genug Mitsignierer freigegeben haben.
          </p>
        </div>
      ) : (
        items.map((tx) => (
          <PendingTxRow key={tx.safeTxHash} tx={tx} account={account} wallet={wallet} isOwner={isOwner} onChange={load} />
        ))
      )}
    </div>
  );
}

function PendingTxRow({
  tx,
  account,
  wallet,
  isOwner,
  onChange,
}: {
  tx: TxView;
  account?: Account;
  wallet?: Wallet;
  isOwner: boolean;
  onChange: () => void;
}) {
  const { state, run, busy } = useTxAction();
  const [mode, setMode] = useState<"approve" | "execute" | null>(null);
  const youAddress = account?.address;
  const ready = tx.confirmations >= tx.threshold;
  const userSigned =
    !!youAddress && tx.owners.some((o) => o.address.toLowerCase() === youAddress.toLowerCase() && o.signed);

  async function approve() {
    if (!account) return;
    setMode("approve");
    const ok = await run(["Freigabe wird auf der Blockchain bestätigt …"], async (step) => {
      step(0);
      const txHash = await confirmTx({ safeTxHash: tx.safeTxHash, account, wallet });
      return {
        message: "Freigegeben. Danke — die Transaktion ist jetzt einen Schritt weiter.",
        txHash: txHash || undefined,
      };
    });
    setMode(null);
    if (ok) onChange();
  }

  async function execute() {
    if (!account) return;
    setMode("execute");
    const ok = await run(["Auszahlung wird ausgeführt …"], async (step) => {
      step(0);
      const txHash = await executeTx({ safeTxHash: tx.safeTxHash, account });
      return { message: "Ausgeführt — die Transaktion wurde auf der Blockchain bestätigt.", txHash };
    });
    setMode(null);
    if (ok) setTimeout(onChange, 1500);
  }

  const statusOverride = mode === "execute" && busy ? ("wird_ausgefuehrt" as const) : undefined;

  const actions = isOwner ? (
    <>
      {!userSigned && !ready && (
        <button
          onClick={approve}
          disabled={busy}
          className="rounded-md border border-[#00498B] px-3 py-1.5 text-xs font-semibold text-[#00498B] transition-colors hover:bg-[#00498B] hover:text-white disabled:opacity-50"
        >
          {busy && mode === "approve" ? "Wird freigegeben …" : "Freigeben"}
        </button>
      )}
      {userSigned && !ready && (
        <span className="text-xs text-emerald-700">✓ Du hast freigegeben — es fehlen noch weitere Mitsignierer.</span>
      )}
      {ready && !tx.executed && (
        <button
          onClick={execute}
          disabled={busy}
          className="rounded-md bg-[#00498B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#00366a] disabled:opacity-50"
        >
          {busy && mode === "execute" ? "Wird ausgeführt …" : "Ausführen"}
        </button>
      )}
    </>
  ) : null;

  return (
    <TxCard
      tx={tx}
      youAddress={youAddress}
      statusOverride={statusOverride}
      actions={actions}
      feedback={<ActionFeedback state={state} onRetry={mode === "execute" ? execute : approve} />}
    />
  );
}
