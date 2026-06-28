"use client";
import { useState } from "react";
import { isAddress, parseEther } from "viem";
import { buildTransfer } from "@/lib/gemeinschaftskasse/safe-client";
import { useProposeMetaTx } from "./useProposeMetaTx";
import { useIsOwner } from "./useIsOwner";
import type { AssetId } from "@/lib/gemeinschaftskasse/constants";

const ASSET_OPTIONS: { id: AssetId; label: string }[] = [
  { id: "xdai", label: "xDAI" },
  { id: "eure", label: "EURe" },
  { id: "muenzen", label: "Röbel-Münzen" },
];

export function CreatePayout({ onCreated }: { onCreated: () => void }) {
  const propose = useProposeMetaTx();
  const { isOwner, loading: ownerLoading } = useIsOwner();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<AssetId>("eure");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);

    if (!isAddress(to)) {
      setErr("Ungültige Empfängeradresse.");
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setErr("Bitte einen gültigen Betrag eingeben.");
      return;
    }

    setBusy(true);
    try {
      const metaTx = buildTransfer({ asset, to, amountWei: parseEther(amount) });
      const { safeTxHash } = await propose(metaTx);
      setTo("");
      setAmount("");
      setSuccess(`Auszahlung vorgeschlagen (${safeTxHash.slice(0, 10)}…). Weitere Freigaben erforderlich.`);
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ownerLoading && !isOwner) {
    return (
      <div className="rounded-lg border border-border p-5">
        <h3 className="text-base font-semibold mb-2">Neue Auszahlung vorschlagen</h3>
        <p className="text-sm text-muted-foreground">
          Nur Mitsignierer können Auszahlungen erstellen.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-5">
      <h3 className="text-base font-semibold mb-4">Neue Auszahlung vorschlagen</h3>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Empfängeradresse
          </label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x…"
            disabled={busy}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#00498B] disabled:opacity-50"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Betrag</label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={busy}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#00498B] disabled:opacity-50"
            />
          </div>
          <div className="w-48">
            <label className="block text-sm font-medium mb-1">Währung</label>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value as AssetId)}
              disabled={busy}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00498B] disabled:opacity-50"
            >
              {ASSET_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {err && (
          <p className="text-sm text-red-600">{err}</p>
        )}
        {success && (
          <p className="text-sm text-green-700">{success}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-[#00498B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00366a] disabled:opacity-60 transition-colors"
        >
          {busy ? "Wird vorgeschlagen…" : "Auszahlung vorschlagen"}
        </button>
      </form>
    </div>
  );
}
