"use client";
import { useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { isAddress, parseEther } from "viem";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { buildTransfer, proposeMetaTx } from "@/lib/gemeinschaftskasse/safe-client";
import type { AssetId } from "@/lib/gemeinschaftskasse/constants";
import { XDAI_EUR, getXdaiEurRate } from "@/lib/muenzen/constants";
import { useIsOwner } from "./useIsOwner";
import { useTxAction } from "./useTxAction";
import { ActionFeedback } from "./ui/ActionFeedback";
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const num = (n: number, d = 2) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d }).format(n);

const ASSETS: { id: AssetId; label: string }[] = [
  { id: "eure", label: "EURe" },
  { id: "xdai", label: "xDAI" },
  { id: "muenzen", label: "Röbel-Münzen" },
];

interface Bal {
  id: string;
  amount: number;
  eur: number | null;
}

export function CreatePayout({ onCreated }: { onCreated: () => void }) {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { isOwner, loading: ownerLoading } = useIsOwner();
  const { state, run, busy, reset } = useTxAction();

  const [asset, setAsset] = useState<AssetId>("eure");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"form" | "review">("form");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [balances, setBalances] = useState<Bal[]>([]);
  const [xdaiRate, setXdaiRate] = useState(XDAI_EUR);

  useEffect(() => {
    fetch("/api/gemeinschaftskasse/overview")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.assets)) setBalances(d.assets);
      })
      .catch(() => {});
    getXdaiEurRate().then(setXdaiRate).catch(() => {});
  }, []);

  if (!ownerLoading && !isOwner) {
    return (
      <div className="rounded-xl border border-border p-5">
        <h3 className="mb-1 text-base font-semibold">Neue Auszahlung vorschlagen</h3>
        <p className="text-sm text-muted-foreground">
          Nur Mitsignierer können Auszahlungen erstellen. Offene Vorgänge kannst du unten mitverfolgen.
        </p>
      </div>
    );
  }

  const meta = ASSETS.find((a) => a.id === asset)!;
  const bal = balances.find((b) => b.id === asset);
  const parsed = parseFloat(amount.replace(",", "."));
  const euros = asset === "xdai" ? (parsed || 0) * xdaiRate : asset === "eure" ? parsed || 0 : null;

  function toReview(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!isAddress(to)) return setFormErr("Bitte eine gültige Empfängeradresse (0x…) eingeben.");
    if (!amount || isNaN(parsed) || parsed <= 0) return setFormErr("Bitte einen Betrag größer als 0 eingeben.");
    if (bal && parsed > bal.amount) return setFormErr(`Nicht genug ${meta.label} in der Kasse — verfügbar: ${num(bal.amount)}.`);
    setPhase("review");
  }

  async function submit() {
    if (!account) return;
    const ok = await run(
      ["Auszahlung wird vorbereitet …", "Deine Freigabe wird auf der Blockchain bestätigt …"],
      async (step) => {
        step(0);
        const metaTx = buildTransfer({ asset, to, amountWei: parseEther(amount.replace(",", ".")) });
        step(1);
        const { approvalTxHash } = await proposeMetaTx({ metaTx, account, wallet });
        return {
          message: "Auszahlung vorgeschlagen und von dir freigegeben. Sie braucht jetzt weitere Mitsignierer.",
          txHash: approvalTxHash,
        };
      },
    );
    if (ok) {
      setTo("");
      setAmount("");
      setPhase("form");
      onCreated();
    }
  }

  if (state.phase === "success") {
    return (
      <div className="rounded-xl border border-border p-5">
        <h3 className="text-base font-semibold">Neue Auszahlung vorschlagen</h3>
        <ActionFeedback state={state} />
        <button onClick={reset} className="mt-3 text-sm font-medium text-[#00498B] hover:underline">
          Weitere Auszahlung vorschlagen
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-5">
      <h3 className="mb-4 text-base font-semibold">Neue Auszahlung vorschlagen</h3>

      {phase === "form" ? (
        <form onSubmit={toReview} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Währung</label>
            <div className="grid grid-cols-3 gap-2">
              {ASSETS.map((a) => {
                const b = balances.find((x) => x.id === a.id);
                const active = a.id === asset;
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => setAsset(a.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      active ? "border-[#00498B] bg-[#00498B]/5" : "border-border hover:border-[#00498B]/40"
                    }`}
                  >
                    <span className="block text-sm font-medium">{a.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {b ? `${num(b.amount)} verfügbar` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Betrag</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00498B]"
            />
            {euros != null && parsed > 0 && <p className="mt-1 text-xs text-muted-foreground">≈ {eur(euros)}</p>}
            {asset === "muenzen" && (
              <p className="mt-1 text-xs text-muted-foreground">Röbel-Münzen sind nicht in Euro einlösbar.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Empfänger-Adresse</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[#00498B]"
            />
          </div>

          {formErr && <p className="text-sm text-red-600">{formErr}</p>}

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#00498B] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#00366a]"
          >
            Weiter zur Prüfung <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">Du zahlst</p>
            <p className="mt-0.5 text-xl font-semibold">
              {asset === "muenzen" ? `${num(parsed)} Röbel-Münzen` : `${num(parsed)} ${meta.label}`}
              {euros != null && <span className="ml-2 text-base font-normal text-muted-foreground">≈ {eur(euros)}</span>}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">an</p>
            <p className="break-all font-mono text-sm">{to}</p>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Mit „Vorschlagen &amp; freigeben“ erstellst du die Auszahlung und gibst sie als Erste(r) frei. Ausgeführt
            wird sie erst, wenn genug Mitsignierer zugestimmt haben.
          </div>

          <ActionFeedback state={state} onRetry={submit} />

          {state.phase !== "error" && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPhase("form");
                  reset();
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" /> Zurück
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 rounded-md bg-[#00498B] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#00366a] disabled:opacity-60"
              >
                {busy ? "Wird vorgeschlagen …" : "Vorschlagen & freigeben"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
