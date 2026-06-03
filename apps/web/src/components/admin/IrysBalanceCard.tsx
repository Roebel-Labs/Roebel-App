"use client";

import { useCallback, useEffect, useState } from "react";

type IrysBalance = {
  address: string;
  atomicBalance: string;
  ethBalance: string;
  token: string;
  network: string;
};

const DEFAULT_FUND_ETH = 0.001;
// Same cap as the /api/irys/fund route — keep in sync.
const MAX_FUND_ETH = 0.005;

/**
 * Admin card that shows the current Irys node balance for the server
 * wallet and lets the caller top it up. Used in the CreateProposalForm
 * (org & admin dashboards) so an Attester can fund the node before submitting.
 */
export function IrysBalanceCard() {
  const [balance, setBalance] = useState<IrysBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState<string>(String(DEFAULT_FUND_ETH));
  const [lastFundTxId, setLastFundTxId] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/irys/balance", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setBalance(data as IrysBalance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load balance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleFund = async () => {
    setError(null);
    setLastFundTxId(null);
    const amount = Number(fundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Bitte eine positive Zahl in ETH eingeben");
      return;
    }
    if (amount > MAX_FUND_ETH) {
      setError(`Maximal ${MAX_FUND_ETH} ETH pro Aufladung`);
      return;
    }

    setFunding(true);
    try {
      const res = await fetch("/api/irys/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountEth: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setLastFundTxId(data.txId ?? null);
      setBalance({
        address: data.address,
        atomicBalance: data.newAtomicBalance,
        ethBalance: data.newEthBalance,
        token: balance?.token ?? "base-eth",
        network: balance?.network ?? "mainnet",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Funding fehlgeschlagen");
    } finally {
      setFunding(false);
    }
  };

  const ethValue = balance ? Number(balance.ethBalance) : 0;
  const lowBalance = balance ? ethValue < 0.0001 : false;

  return (
    <div
      className={`rounded-lg border p-4 ${
        lowBalance
          ? "bg-red-50 border-red-200"
          : "bg-muted border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium text-sm text-foreground">
            Irys-Node Guthaben
          </h4>
          {loading ? (
            <p className="text-xs text-muted-foreground mt-1">Lade Guthaben…</p>
          ) : balance ? (
            <>
              <p
                className={`text-lg font-mono mt-1 ${
                  lowBalance ? "text-red-700" : "text-foreground"
                }`}
              >
                {Number(balance.ethBalance).toFixed(6)} ETH
              </p>
              <p className="text-[11px] text-muted-foreground font-mono break-all mt-1">
                Wallet: {balance.address}
              </p>
              {lowBalance && (
                <p className="text-xs text-red-700 mt-2">
                  Guthaben zu niedrig — Uploads werden mit{" "}
                  <code>402: Not enough balance</code> fehlschlagen.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Guthaben unbekannt
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={fetchBalance}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
        >
          Aktualisieren
        </button>
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.0001"
          min={0}
          max={MAX_FUND_ETH}
          value={fundAmount}
          onChange={(e) => setFundAmount(e.target.value)}
          disabled={funding}
          className="w-full sm:w-32 bg-card border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50"
          placeholder="ETH"
        />
        <button
          type="button"
          onClick={handleFund}
          disabled={funding}
          className="bg-black hover:bg-foreground/90 disabled:bg-muted disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-md transition-colors flex items-center justify-center gap-2"
        >
          {funding ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Aufladen…
            </>
          ) : (
            `Aufladen (max ${MAX_FUND_ETH} ETH)`
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      )}

      {lastFundTxId && (
        <p className="mt-2 text-xs text-green-700 break-all">
          ✅ Aufgeladen — Tx: <span className="font-mono">{lastFundTxId}</span>
        </p>
      )}
    </div>
  );
}
