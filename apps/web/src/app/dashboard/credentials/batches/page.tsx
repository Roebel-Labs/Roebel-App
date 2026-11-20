"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { useCredentials } from "@/components/credentials/CredentialsContext";
import { PendingActionPanel, freshAction } from "@/components/credentials/PendingActionPanel";
import { credentialsFile, credentialsRequest, type ActionView as PanelAction } from "@/lib/credentials/client";
import type { ActionView } from "@/lib/credentials/actions";
import { batchRows, type BatchRowView } from "@/lib/credentials/views";

const STATE_STYLE: Record<BatchRowView["state"], string> = {
  "Wartet auf Bestätigung": "bg-amber-100 text-amber-800",
  Eingetragen: "bg-green-100 text-green-800",
  Widerrufen: "bg-red-100 text-red-800",
  Verworfen: "bg-muted text-[#6B7280]",
  Abgelaufen: "bg-muted text-[#6B7280]",
  Fehlgeschlagen: "bg-red-100 text-red-800",
};

const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function CredentialBatchesPage() {
  const { account, org } = useCredentials();
  const [rows, setRows] = useState<BatchRowView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [pending, setPending] = useState<PanelAction | null>(null);

  const load = useCallback(async () => {
    const r = await credentialsRequest<ActionView[]>(account, "org", "actions_list", { accountId: org.accountId });
    if (!r.ok) return setError(r.message);
    setRows(batchRows(r.data, r.data.flatMap((a) => a.batches ?? [])));
  }, [account, org.accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function letters(batchId: string) {
    setBusy(batchId);
    setError(null);
    const r = await credentialsFile(account, "org", "letters", { accountId: org.accountId, batchId });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ausweis-briefe.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function revoke(batchId: string) {
    setConfirmRevoke(null);
    setBusy(batchId);
    setError(null);
    const r = await credentialsRequest<{ actionId: string }>(account, "org", "revoke_prepare", { accountId: org.accountId, batchId, client: "dashboard" });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setPending(freshAction(r.data.actionId, "Ganze Ausstellung widerrufen"));
  }

  return (
    <div className="space-y-4">
      {pending && <PendingActionPanel action={pending} onSettled={() => void load()} onClose={() => setPending(null)} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <div className="h-24 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#6B7280]">Noch keine Ausstellungen.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-[#B4B8C1] bg-card p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{r.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[r.state]}`}>{r.state}</span>
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    {when(r.when)} · {r.counts.invited} eingeladen · {r.counts.accepted} angenommen · {r.counts.revoked} widerrufen
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.letters && (
                    <button
                      type="button"
                      onClick={() => letters(r.id)}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-1 rounded-md border border-[#B4B8C1] px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <FileDown className="h-3.5 w-3.5" aria-hidden /> Briefe herunterladen (PDF)
                    </button>
                  )}
                  {r.state === "Eingetragen" && (
                    <button
                      type="button"
                      onClick={() => setConfirmRevoke(r.id)}
                      disabled={busy === r.id}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Ganze Ausstellung widerrufen
                    </button>
                  )}
                </div>
              </div>
              {confirmRevoke === r.id && (
                <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-3" role="alertdialog" aria-label="Widerruf bestätigen">
                  <p className="text-sm text-red-800">Alle Ausweise dieser Ausstellung werden sofort ungültig.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => revoke(r.id)} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white">
                      Widerrufen
                    </button>
                    <button type="button" onClick={() => setConfirmRevoke(null)} className="rounded-md px-3 py-1.5 text-xs text-[#6B7280] hover:bg-muted">
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
