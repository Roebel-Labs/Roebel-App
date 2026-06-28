"use client";
import { useCallback, useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import {
  initProtocolKit,
  resolveSigner,
  executeFromService,
  type RawTxFromService,
} from "@/lib/gemeinschaftskasse/safe-client";
import { EthSafeSignature } from "@safe-global/protocol-kit";
import { approvalLabel } from "@/lib/gemeinschaftskasse/format";
import type { TxView } from "@/lib/gemeinschaftskasse/constants";

interface PendingQueueProps {
  /** Bump this value to trigger a refetch from outside (e.g. after CreatePayout). */
  refreshKey?: number;
}

export function PendingQueue({ refreshKey }: PendingQueueProps) {
  const account = useActiveAccount();
  const wallet = useActiveWallet();

  const [items, setItems] = useState<TxView[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // safeTxHash currently processing
  const [actionErr, setActionErr] = useState<Record<string, string>>({});

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

  function setItemErr(hash: string, msg: string) {
    setActionErr((prev) => ({ ...prev, [hash]: msg }));
  }

  async function fetchRaw(safeTxHash: string): Promise<RawTxFromService> {
    const r = await fetch(`/api/gemeinschaftskasse/tx?safeTxHash=${encodeURIComponent(safeTxHash)}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    return d as RawTxFromService;
  }

  async function handleFreigeben(item: TxView) {
    if (!account || !wallet) {
      setItemErr(item.safeTxHash, "Bitte zuerst anmelden.");
      return;
    }
    setBusy(item.safeTxHash);
    setActionErr((prev) => { const n = { ...prev }; delete n[item.safeTxHash]; return n; });
    try {
      const protocolKit = await initProtocolKit(wallet);
      const signer = await resolveSigner(protocolKit, account, wallet);
      if (!signer) throw new Error("Du bist kein Mitsignierer dieser Kasse.");

      // Sign the existing safeTxHash directly.
      const inner = await account.signMessage({
        message: { raw: item.safeTxHash as `0x${string}` },
      });

      let signature: string;
      if (signer.isSmart) {
        const { buildSignatureBytes, buildContractSignature } = await import("@safe-global/protocol-kit");
        const contractSig = await buildContractSignature(
          [new EthSafeSignature(signer.ownerAddress, inner, true)],
          signer.ownerAddress,
        );
        signature = buildSignatureBytes([contractSig]);
      } else {
        const { buildSignatureBytes } = await import("@safe-global/protocol-kit");
        signature = buildSignatureBytes([new EthSafeSignature(signer.ownerAddress, inner)]);
      }

      const res = await fetch("/api/gemeinschaftskasse/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ safeTxHash: item.safeTxHash, signature }),
      }).then((r) => r.json());

      if (res.error) throw new Error(res.error);
      load();
    } catch (e) {
      setItemErr(item.safeTxHash, (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleAusfuehren(item: TxView) {
    if (!account || !wallet) {
      setItemErr(item.safeTxHash, "Bitte zuerst anmelden.");
      return;
    }
    setBusy(item.safeTxHash);
    setActionErr((prev) => { const n = { ...prev }; delete n[item.safeTxHash]; return n; });
    try {
      const [raw, protocolKit] = await Promise.all([
        fetchRaw(item.safeTxHash),
        initProtocolKit(wallet),
      ]);
      const txHash = await executeFromService(protocolKit, account, raw);
      setItemErr(item.safeTxHash, `Ausgeführt: ${txHash.slice(0, 10)}…`);
      // Reload after a brief moment to let the service register execution.
      setTimeout(() => load(), 2000);
    } catch (e) {
      setItemErr(item.safeTxHash, (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Lade ausstehende Transaktionen…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-600">Fehler: {err}</p>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
        Keine ausstehenden Transaktionen.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Ausstehende Transaktionen</h3>
      {items.map((item) => {
        const ready = item.confirmations >= item.threshold;
        const isBusy = busy === item.safeTxHash;
        const itemErr = actionErr[item.safeTxHash];
        // Whether the current user has already signed.
        const userSigned = account
          ? item.signers.some((s) => s.toLowerCase() === account.address.toLowerCase())
          : false;

        return (
          <div key={item.safeTxHash} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.title}</p>
                <p
                  className={`text-xs mt-0.5 ${ready ? "text-green-700" : "text-muted-foreground"}`}
                >
                  {approvalLabel(item.confirmations, item.threshold)}
                </p>
                {item.submissionDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Erstellt: {new Date(item.submissionDate).toLocaleDateString("de-DE")}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {!userSigned && !ready && (
                  <button
                    onClick={() => handleFreigeben(item)}
                    disabled={isBusy}
                    className="rounded-md border border-[#00498B] px-3 py-1.5 text-xs font-semibold text-[#00498B] hover:bg-[#00498B] hover:text-white disabled:opacity-50 transition-colors"
                  >
                    {isBusy ? "…" : "Freigeben"}
                  </button>
                )}
                {ready && !item.executed && (
                  <button
                    onClick={() => handleAusfuehren(item)}
                    disabled={isBusy}
                    className="rounded-md bg-[#00498B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#00366a] disabled:opacity-50 transition-colors"
                  >
                    {isBusy ? "Wird ausgeführt…" : "Ausführen"}
                  </button>
                )}
              </div>
            </div>
            {itemErr && (
              <p
                className={`text-xs mt-2 ${itemErr.startsWith("Ausgeführt") ? "text-green-700" : "text-red-600"}`}
              >
                {itemErr}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
