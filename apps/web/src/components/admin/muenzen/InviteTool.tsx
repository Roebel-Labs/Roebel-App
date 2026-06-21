"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { muenzenWrite } from "./data";
import { shortAddr } from "@/lib/muenzen/constants";

export function InviteTool() {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const valid = /^0x[0-9a-fA-F]{40}$/.test(address.trim());

  const invite = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await muenzenWrite("invite", "POST", { address: address.trim() });
      const r = res.result ?? {};
      const message = r.alreadyRegistered
        ? "Bereits ein Circles-Mensch — keine Aktion nötig."
        : r.inviter
          ? `Eingeladen ✓ (Inviter ${shortAddr(r.inviter)}, Tx ${shortAddr(r.txHash)})`
          : "Eingeladen ✓";
      setResult({ ok: true, message });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Lädt eine verifizierte Bürger:in (CitizenNFT auf Gnosis) per Operator ins Circles-Vertrauen ein. Der Operator-Schlüssel
        liegt ausschließlich in den Supabase-Secrets — die Web-App löst nur die Edge-Function aus.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm"
          placeholder="0x… Gnosis-Adresse"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button
          type="button"
          disabled={!valid || busy}
          onClick={invite}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#194383] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {busy ? "Lädt ein…" : "Einladen"}
        </button>
      </div>
      {result && (
        <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-red-600"}`}>{result.message}</p>
      )}
    </div>
  );
}
