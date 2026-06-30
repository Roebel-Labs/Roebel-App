"use client";
import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { Sparkles, KeyRound, UserPlus, ShieldCheck } from "lucide-react";
import {
  buildAddOwner,
  buildRemoveOwner,
  buildChangeThreshold,
  proposeMetaTx,
} from "@/lib/gemeinschaftskasse/safe-client";
import { useIsOwner } from "./useIsOwner";
import { useTxAction } from "./useTxAction";
import { ActionFeedback } from "./ui/ActionFeedback";
import { Explainer } from "./ui/Explainer";
import { MemberRow } from "./MemberRow";
import { OwnerListSkeleton } from "./skeletons";
import type { OwnerView } from "@/lib/gemeinschaftskasse/constants";

interface OverviewData {
  owners: OwnerView[];
  threshold: number;
}

export function Mitglieder() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { isOwner } = useIsOwner();
  const { state, run, busy, reset } = useTxAction();

  const [data, setData] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [newOwner, setNewOwner] = useState("");
  const [newThreshold, setNewThreshold] = useState("");
  const [runningAddr, setRunningAddr] = useState<string | null>(null);

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

  async function runPropose(metaTx: { to: string; value: string; data: string }, successMsg: string) {
    if (!account) {
      setFormErr("Bitte zuerst anmelden.");
      return false;
    }
    setFormErr(null);
    reset();
    const ok = await run(["Vorschlag wird erstellt und freigegeben …"], async (step) => {
      step(0);
      const { approvalTxHash } = await proposeMetaTx({ metaTx, account, wallet });
      return { message: successMsg, txHash: approvalTxHash };
    });
    if (ok) load();
    return ok;
  }

  async function addOwner(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!data) return;
    if (!isAddress(newOwner)) {
      setFormErr("Bitte eine gültige Adresse (0x…) eingeben.");
      return;
    }
    const ok = await runPropose(
      buildAddOwner(newOwner, data.threshold),
      "Neues Mitglied vorgeschlagen. Bitte unter „Auszahlungen“ freigeben.",
    );
    if (ok) setNewOwner("");
  }

  async function removeOwner(owner: OwnerView) {
    if (!data) return;
    const newT = Math.min(data.threshold, data.owners.length - 1);
    if (newT < 1) {
      setFormErr("Mindestens ein Mitsignierer muss verbleiben.");
      return;
    }
    setRunningAddr(owner.address);
    await runPropose(
      buildRemoveOwner(data.owners.map((o) => o.address), owner.address, newT),
      `Entfernung von „${owner.name}“ vorgeschlagen. Bitte unter „Auszahlungen“ freigeben.`,
    );
    setRunningAddr(null);
  }

  async function changeThreshold(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!data) return;
    const t = parseInt(newThreshold, 10);
    if (isNaN(t) || t < 1 || t > data.owners.length) {
      setFormErr(`Schwelle muss zwischen 1 und ${data.owners.length} liegen.`);
      return;
    }
    const ok = await runPropose(
      buildChangeThreshold(t),
      `Schwellenänderung auf ${t} vorgeschlagen. Bitte unter „Auszahlungen“ freigeben.`,
    );
    if (ok) setNewThreshold("");
  }

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!data) return <OwnerListSkeleton />;

  return (
    <div className="space-y-6">
      <Explainer title="Mitsignierer & Freigaben verstehen">
        <p>
          Jeder <strong>Mitsignierer</strong> kann Auszahlungen vorschlagen und freigeben. Ausgeführt wird erst, wenn die{" "}
          <strong>Schwelle</strong> erreicht ist ({data.threshold} von {data.owners.length}).
        </p>
        <p>
          Eine <strong>Smart-Wallet</strong> (z. B. die Röbel-App) gibt direkt auf der Blockchain frei. Eine{" "}
          <strong>normale Wallet</strong> (z. B. MetaMask) gibt per Unterschrift frei. Beides zählt gleich.
        </p>
        <p>Mitglieder hinzufügen/entfernen oder die Schwelle ändern ist selbst eine Transaktion, die freigegeben werden muss.</p>
      </Explainer>

      {!isOwner && (
        <p className="text-sm text-muted-foreground">
          Nur Mitsignierer können Mitglieder verwalten — du siehst hier den aktuellen Stand.
        </p>
      )}

      {state.phase !== "idle" && <ActionFeedback state={state} />}
      {formErr && <p className="text-sm text-red-600">{formErr}</p>}

      <div className="rounded-xl border border-border p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Mitsignierer ({data.owners.length})</h3>
          <span className="text-sm text-muted-foreground">
            Schwelle: {data.threshold} von {data.owners.length}
          </span>
        </div>
        <ul className="space-y-3">
          {data.owners.map((o) => (
            <li key={o.address} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <MemberRow m={o} />
                <WalletTag isSmart={o.isSmart} />
              </div>
              {isOwner && (
                <button
                  onClick={() => removeOwner(o)}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {runningAddr === o.address ? "…" : "Entfernen"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isOwner && (
        <>
          <div className="rounded-xl border border-border p-5">
            <h3 className="mb-1 flex items-center gap-2 text-base font-semibold">
              <UserPlus className="h-4 w-4 text-[#00498B]" /> Mitglied hinzufügen
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">Die Adresse wird als neuer Mitsignierer vorgeschlagen.</p>
            <form onSubmit={addOwner} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="0x… Adresse"
                disabled={busy}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[#00498B] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy}
                className="shrink-0 rounded-md bg-[#00498B] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00366a] disabled:opacity-60"
              >
                {busy ? "…" : "Vorschlagen"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-border p-5">
            <h3 className="mb-1 flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="h-4 w-4 text-[#00498B]" /> Freigabe-Schwelle ändern
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Aktuell: {data.threshold} von {data.owners.length} Freigaben. Wir empfehlen mindestens 2.
            </p>
            <form onSubmit={changeThreshold} className="flex gap-2">
              <input
                type="number"
                min={1}
                max={data.owners.length}
                value={newThreshold}
                onChange={(e) => setNewThreshold(e.target.value)}
                placeholder={`1–${data.owners.length}`}
                disabled={busy}
                className="w-28 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00498B] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[#00498B] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00366a] disabled:opacity-60"
              >
                {busy ? "…" : "Schwelle ändern"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function WalletTag({ isSmart }: { isSmart?: boolean }) {
  if (isSmart === undefined) return null;
  return isSmart ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#00498B]/20 bg-[#00498B]/5 px-2 py-0.5 text-[11px] font-medium text-[#00498B]">
      <Sparkles className="h-3 w-3" /> Smart-Wallet
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <KeyRound className="h-3 w-3" /> Normale Wallet
    </span>
  );
}
