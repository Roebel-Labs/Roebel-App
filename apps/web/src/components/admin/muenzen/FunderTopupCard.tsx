"use client";

// "Funder aufladen" — the connected admin wallet (usually the gasless thirdweb
// smart account) sends Röbel Münzen to the operational funder wallet with one
// signature: Hub.safeTransferFrom(account, funder, groupTokenId, amount, "0x").
// Röbel Münzen are a Circles v2 group token, i.e. an ERC-1155 id in the Hub —
// NOT a transfer on the group contract itself.
import * as React from "react";
import { getContract, prepareContractCall, readContract, sendTransaction, waitForReceipt } from "thirdweb";
import { getWalletBalance } from "thirdweb/wallets";
import { useActiveAccount } from "thirdweb/react";
import { ArrowRight, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { client } from "@/app/client";
import { gnosis } from "@/lib/gnosis";
import { ADDR, GROUP_TOKEN_ID, attoToNumber } from "@/lib/muenzen/constants";
import { FUNDER_MIN_XDAI, parseMuenzenAmount, topupErrorMessage } from "@/lib/muenzen/topup";
import { ChartCard } from "./ui";
import { fmt, fmtRcrc } from "./format";

const hub = getContract({ client, chain: gnosis, address: ADDR.hub });

async function readRcrc(address: string): Promise<bigint> {
  return readContract({
    contract: hub,
    method: "function balanceOf(address account, uint256 id) view returns (uint256)",
    params: [address, GROUP_TOKEN_ID],
  });
}

interface Balances {
  own: bigint;
  funder: bigint;
  funderXdai: number;
}

type Status =
  | { kind: "idle" }
  | { kind: "pending"; hash?: string }
  | { kind: "success"; hash: string }
  | { kind: "error"; message: string };

export function FunderTopupCard({ onDone, className }: { onDone?: () => void; className?: string }) {
  const account = useActiveAccount();
  const [balances, setBalances] = React.useState<Balances | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const loadBalances = React.useCallback(async () => {
    if (!account) return;
    try {
      setLoadError(null);
      const [own, funder, xdai] = await Promise.all([
        readRcrc(account.address),
        readRcrc(ADDR.funder),
        getWalletBalance({ client, chain: gnosis, address: ADDR.funder }),
      ]);
      setBalances({ own, funder, funderXdai: Number(xdai.displayValue) });
    } catch (err) {
      setLoadError(topupErrorMessage(err));
    }
  }, [account]);

  React.useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  if (!account) return null;

  const parsed = input.trim() ? parseMuenzenAmount(input, balances?.own ?? null) : null;
  const busy = status.kind === "pending";
  const canSubmit = !!parsed?.ok && !!balances && !busy;
  const lowGas = balances != null && balances.funderXdai < FUNDER_MIN_XDAI;

  async function submit() {
    if (!account || !parsed?.ok) return;
    setStatus({ kind: "pending" });
    try {
      const tx = prepareContractCall({
        contract: hub,
        method: "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
        params: [account.address, ADDR.funder, GROUP_TOKEN_ID, parsed.atto, "0x"],
      });
      const { transactionHash } = await sendTransaction({ transaction: tx, account });
      setStatus({ kind: "pending", hash: transactionHash });
      const receipt = await waitForReceipt({ client, chain: gnosis, transactionHash });
      if (receipt.status !== "success") throw new Error("transaction reverted");
      setStatus({ kind: "success", hash: transactionHash });
      setInput("");
      await loadBalances();
      onDone?.();
    } catch (err) {
      console.error("[muenzen/funder-topup] failed", err);
      setStatus({ kind: "error", message: topupErrorMessage(err) });
    }
  }

  return (
    <ChartCard
      className={className}
      title="Funder aufladen"
      subtitle="Röbel Münzen gehen an das Funder-Wallet. Es zahlt damit Wahlhelfer-Belohnungen und die 5 % Plattformgebühr in Münzen direkt nach dem Signieren aus."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Dein Wallet" value={balances ? fmtRcrc(attoToNumber(balances.own)) : "…"} />
        <Stat label="Funder · Münzen" value={balances ? fmtRcrc(attoToNumber(balances.funder)) : "…"} />
        <Stat
          label="Funder · Gas"
          value={balances ? `${fmt(balances.funderXdai)} xDAI` : "…"}
          warn={lowGas}
        />
      </div>

      {lowGas && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Funder hat weniger als {fmt(FUNDER_MIN_XDAI)} xDAI Gas-Reserve — Auszahlungen können scheitern. xDAI separat nachfüllen.
        </p>
      )}
      {loadError && <p className="mt-3 text-xs text-red-600">Guthaben konnten nicht geladen werden: {loadError}</p>}

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex-1">
          <div className="flex items-center rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-[#00498B]/40">
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="Betrag, z. B. 25,50"
              value={input}
              disabled={busy}
              onChange={(e) => {
                setInput(e.target.value);
                if (status.kind !== "pending") setStatus({ kind: "idle" });
              }}
              className="w-full bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-60"
            />
            <span className="pr-3 text-xs text-muted-foreground">Münzen</span>
          </div>
          {parsed && !parsed.ok && <p className="mt-1 text-xs text-red-600">{parsed.error}</p>}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#00498B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#003a70] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Aufladen
        </button>
      </form>

      {status.kind === "pending" && (
        <p className="mt-3 text-xs text-muted-foreground">
          {status.hash ? "Transaktion gesendet — warte auf Bestätigung…" : "Bitte im Wallet bestätigen…"}
        </p>
      )}
      {status.kind === "success" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Funder aufgeladen.
          <a
            href={`https://gnosisscan.io/tx/${status.hash}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Transaktion ansehen
          </a>
        </p>
      )}
      {status.kind === "error" && <p className="mt-3 text-xs text-red-600">{status.message}</p>}
    </ChartCard>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</p>
    </div>
  );
}
