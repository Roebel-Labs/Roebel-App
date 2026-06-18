"use client";

// Röbel-Taler "Trust" tool — invite a wallet into Circles from a PASSKEY wallet
// (e.g. your Metri account 0x1f14…) that a script can't sign for. You connect that
// wallet via WalletConnect (Metri scans the QR) and approve Hub.trust(trustee) with
// your passkey. That is the Circles invitation; the trustee then registers in the
// Röbel app ("Bei Röbel-Taler mitmachen"), which burns 96 of YOUR personal CRC and
// mints a 48 CRC welcome bonus to them.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ConnectButton,
  useActiveAccount,
  useActiveWalletChain,
  useSwitchActiveWalletChain,
  useSendTransaction,
} from "thirdweb/react";
import { walletConnect, createWallet } from "thirdweb/wallets";
import { defineChain } from "thirdweb/chains";
import { getContract, readContract, prepareContractCall } from "thirdweb";
import { isAddress, getAddress, formatEther } from "viem";
import { client } from "../client";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const FAR_EXPIRY = 4102444800n; // ~year 2100 (uint96) — non-expiring trust
const gnosis = defineChain(100);
const hub = getContract({ client, chain: gnosis, address: HUB });

// Connect order: WalletConnect first (Metri / Gnosis passkey wallet scans the QR).
const wallets = [walletConnect(), createWallet("io.metamask"), createWallet("walletConnect")];

type Status = {
  inviterHuman: boolean | null;
  personalCrc: bigint | null;
  trusteeHuman: boolean | null;
  alreadyTrusted: boolean | null;
};

export default function TrustPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted" />}>
      <TrustInner />
    </Suspense>
  );
}

function TrustInner() {
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const switchChain = useSwitchActiveWalletChain();
  const { mutateAsync: sendTx } = useSendTransaction();
  const params = useSearchParams();

  const [trustee, setTrustee] = useState("");
  const [status, setStatus] = useState<Status>({
    inviterHuman: null,
    personalCrc: null,
    trusteeHuman: null,
    alreadyTrusted: null,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  // Prefill the trustee (the thirdweb Gnosis address) from ?address=…
  useEffect(() => {
    const a = params.get("address");
    if (a && isAddress(a)) setTrustee(getAddress(a));
  }, [params]);

  const trusteeValid = useMemo(() => isAddress(trustee), [trustee]);
  const inviter = account?.address ?? null;

  const refresh = useCallback(async () => {
    if (!inviter) return;
    try {
      const inviterHuman = await readContract({
        contract: hub,
        method: "function isHuman(address) view returns (bool)",
        params: [inviter],
      });
      const personalCrc = await readContract({
        contract: hub,
        method: "function balanceOf(address,uint256) view returns (uint256)",
        params: [inviter, BigInt(inviter)],
      });
      let trusteeHuman: boolean | null = null;
      let alreadyTrusted: boolean | null = null;
      if (trusteeValid) {
        trusteeHuman = await readContract({
          contract: hub,
          method: "function isHuman(address) view returns (bool)",
          params: [getAddress(trustee)],
        });
        alreadyTrusted = await readContract({
          contract: hub,
          method: "function isTrusted(address,address) view returns (bool)",
          params: [inviter, getAddress(trustee)],
        });
      }
      setStatus({ inviterHuman, personalCrc, trusteeHuman, alreadyTrusted });
    } catch {
      /* leave previous status */
    }
  }, [inviter, trustee, trusteeValid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onTrust = useCallback(async () => {
    if (!account || !trusteeValid) return;
    setBusy(true);
    setMsg(null);
    try {
      if (chain?.id !== 100) await switchChain(gnosis);
      const tx = prepareContractCall({
        contract: hub,
        method: "function trust(address,uint96)",
        params: [getAddress(trustee), FAR_EXPIRY],
      });
      await sendTx(tx);
      setMsg({
        kind: "ok",
        text:
          "Einladung gesendet ✓ — du vertraust dieser Adresse jetzt. Öffne die Röbel-App mit dieser Wallet und tippe „Bei Röbel-Taler mitmachen“, um die Verifizierung abzuschließen.",
      });
      // Give the node a moment, then re-read.
      setTimeout(() => void refresh(), 3000);
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  }, [account, trusteeValid, trustee, chain?.id, switchChain, sendTx, refresh]);

  const lowCrc = status.personalCrc != null && status.personalCrc < 96n * 10n ** 18n;

  return (
    <div className="min-h-screen bg-muted">
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="text-xl font-semibold text-foreground">Wallet verifizieren (Röbel-Taler)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verbinde deine persönliche Circles-Wallet (z. B. Metri) per WalletConnect und lade die
          Adresse deiner App-Wallet ein. Das kostet beim Abschluss <strong>96 Röbel-Taler</strong>{" "}
          aus deinem persönlichen Guthaben.
        </p>

        <div className="mt-5 rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">1 · Persönliche Wallet verbinden</p>
          <ConnectButton client={client} wallets={wallets} chain={gnosis} />
          {inviter && (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <Row label="Registrierter Circles-Mensch" value={fmtBool(status.inviterHuman)} />
              <Row
                label="Persönliches Guthaben"
                value={status.personalCrc == null ? "…" : `${trim2(formatEther(status.personalCrc))} (≥ 96 nötig)`}
                warn={lowCrc}
              />
              {chain && chain.id !== 100 && <p className="text-amber-600">Bitte zu Gnosis wechseln.</p>}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">2 · Adresse der App-Wallet (Trustee)</p>
          <input
            value={trustee}
            onChange={(e) => setTrustee(e.target.value.trim())}
            placeholder="0x… (Gnosis-Adresse der Thirdweb-Wallet)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-foreground"
            spellCheck={false}
          />
          {trustee && !trusteeValid && <p className="mt-1 text-xs text-red-500">Keine gültige Adresse.</p>}
          {trusteeValid && (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <Row label="Schon ein Circles-Mensch" value={fmtBool(status.trusteeHuman)} />
              <Row label="Von dir bereits eingeladen" value={fmtBool(status.alreadyTrusted)} />
            </div>
          )}
        </div>

        <button
          onClick={onTrust}
          disabled={!account || !trusteeValid || busy || status.alreadyTrusted === true || status.trusteeHuman === true}
          className="mt-4 w-full rounded-md bg-foreground px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-40"
        >
          {busy
            ? "Sende Einladung…"
            : status.trusteeHuman === true
              ? "Bereits verifiziert"
              : status.alreadyTrusted === true
                ? "Bereits eingeladen"
                : "Vertrauen senden (einladen)"}
        </button>

        {lowCrc && status.alreadyTrusted !== true && (
          <p className="mt-2 text-xs text-amber-600">
            Hinweis: Du hast unter 96 persönliches Guthaben. Das Einladen geht trotzdem, aber der
            App-Schritt „mitmachen“ schlägt fehl, bis 96 vorhanden sind (~1/Stunde wachsend).
          </p>
        )}

        {msg && (
          <div
            className={`mt-4 rounded-md border p-3 text-xs ${
              msg.kind === "ok"
                ? "border-green-600/40 bg-green-600/10 text-green-700"
                : msg.kind === "err"
                  ? "border-red-500/40 bg-red-500/10 text-red-600"
                  : "border-border bg-card text-muted-foreground"
            }`}
          >
            {msg.text}
          </div>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
          „Vertrauen“ ist die Circles-Einladung — es bewegt noch kein Guthaben. Die 96 Röbel-Taler
          werden erst verbrannt, wenn die App-Wallet im 2. Schritt „Bei Röbel-Taler mitmachen“
          aufruft (sie erhält dabei 48 als Willkommensbonus). Vertraue der App-Adresse, nicht der
          Gruppe.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={`font-medium ${warn ? "text-amber-600" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function fmtBool(v: boolean | null): string {
  return v == null ? "…" : v ? "Ja ✓" : "Nein";
}

function trim2(s: string): string {
  const [w, f = ""] = s.split(".");
  return f ? `${w},${f.slice(0, 2)}` : w;
}
