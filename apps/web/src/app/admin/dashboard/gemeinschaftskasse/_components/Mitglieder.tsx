"use client";
import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";
import {
  buildAddOwner,
  buildRemoveOwner,
  buildChangeThreshold,
} from "@/lib/gemeinschaftskasse/safe-client";
import { useProposeMetaTx } from "./useProposeMetaTx";
import { useIsOwner } from "./useIsOwner";
import type { OwnerView } from "@/lib/gemeinschaftskasse/constants";

interface OverviewData {
  owners: OwnerView[];
  threshold: number;
}

export function Mitglieder() {
  const propose = useProposeMetaTx();
  const { isOwner } = useIsOwner();

  const [data, setData] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Add-owner form
  const [newOwner, setNewOwner] = useState("");
  // Change-threshold form
  const [newThreshold, setNewThreshold] = useState("");
  // Which remove action is in progress (by address)
  const [removingAddr, setRemovingAddr] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    fetch("/api/gemeinschaftskasse/overview")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData({ owners: d.owners, threshold: d.threshold });
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function showMsg(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 8000);
  }

  async function handleAddOwner(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    if (!isAddress(newOwner)) {
      showMsg("Ungültige Adresse.", false);
      return;
    }
    setBusy(true);
    try {
      const metaTx = buildAddOwner(newOwner, data.threshold);
      await propose(metaTx);
      setNewOwner("");
      showMsg('Vorschlag erstellt. Bitte freigeben unter "Auszahlungen".');
    } catch (e) {
      showMsg((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveOwner(owner: OwnerView) {
    if (!data) return;
    const ownerAddresses = data.owners.map((o) => o.address);
    const newThresholdValue = Math.min(data.threshold, data.owners.length - 1);
    if (newThresholdValue < 1) {
      showMsg("Mindestens ein Mitsignierer muss verbleiben.", false);
      return;
    }
    setRemovingAddr(owner.address);
    try {
      const metaTx = buildRemoveOwner(ownerAddresses, owner.address, newThresholdValue);
      await propose(metaTx);
      showMsg(`Entfernung von „${owner.name}" vorgeschlagen. Bitte freigeben unter „Auszahlungen".`);
    } catch (e) {
      showMsg((e as Error).message, false);
    } finally {
      setRemovingAddr(null);
    }
  }

  async function handleChangeThreshold(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const t = parseInt(newThreshold, 10);
    if (isNaN(t) || t < 1 || t > data.owners.length) {
      showMsg(`Schwelle muss zwischen 1 und ${data.owners.length} liegen.`, false);
      return;
    }
    setBusy(true);
    try {
      const metaTx = buildChangeThreshold(t);
      await propose(metaTx);
      setNewThreshold("");
      showMsg(`Schwellenänderung auf ${t} vorgeschlagen. Bitte freigeben unter „Auszahlungen".`);
    } catch (e) {
      showMsg((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Lädt…</p>;

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`rounded-md p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}
        >
          {msg.text}
        </div>
      )}

      {!isOwner && (
        <p className="text-sm text-muted-foreground">
          Nur Mitsignierer können Mitglieder verwalten.
        </p>
      )}

      {/* Current members list */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">
            Mitsignierer ({data.owners.length})
          </h3>
          <span className="text-sm text-muted-foreground">
            Schwelle: {data.threshold} von {data.owners.length}
          </span>
        </div>
        <ul className="space-y-3">
          {data.owners.map((owner) => (
            <li
              key={owner.address}
              className="flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{owner.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {owner.short}
                </p>
              </div>
              {isOwner && (
                <button
                  onClick={() => handleRemoveOwner(owner)}
                  disabled={removingAddr === owner.address || busy}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {removingAddr === owner.address ? "…" : "Entfernen"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Add owner — owners only */}
      {isOwner && (
        <div className="rounded-lg border border-border p-5">
          <h3 className="text-base font-semibold mb-4">Mitglied hinzufügen</h3>
          <form onSubmit={handleAddOwner} className="flex gap-3">
            <input
              type="text"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              placeholder="0x… Adresse des neuen Mitglieds"
              disabled={busy}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#00498B] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[#00498B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00366a] disabled:opacity-60 transition-colors flex-shrink-0"
            >
              {busy ? "…" : "Hinzufügen"}
            </button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Der Vorschlag muss anschließend unter „Auszahlungen" freigegeben werden.
          </p>
        </div>
      )}

      {/* Change threshold — owners only */}
      {isOwner && (
        <div className="rounded-lg border border-border p-5">
          <h3 className="text-base font-semibold mb-1">Freigabe-Schwelle ändern</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Aktuell: {data.threshold} von {data.owners.length} Unterschriften erforderlich.
          </p>
          <form onSubmit={handleChangeThreshold} className="flex gap-3">
            <input
              type="number"
              min={1}
              max={data.owners.length}
              value={newThreshold}
              onChange={(e) => setNewThreshold(e.target.value)}
              placeholder={`1–${data.owners.length}`}
              disabled={busy}
              className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#00498B] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[#00498B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00366a] disabled:opacity-60 transition-colors"
            >
              {busy ? "…" : "Schwelle ändern"}
            </button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Wir empfehlen mindestens 2 von {data.owners.length} für höhere Sicherheit.
          </p>
        </div>
      )}
    </div>
  );
}
