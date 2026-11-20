"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Upload, Users, X } from "lucide-react";
import { useCredentials, type CredentialTypeView } from "@/components/credentials/CredentialsContext";
import { ImportPreview, type PeoplePreviewView } from "@/components/credentials/ImportPreview";
import { PeopleTable } from "@/components/credentials/PeopleTable";
import { PendingActionPanel, freshAction } from "@/components/credentials/PendingActionPanel";
import { credentialsRequest, type ActionView } from "@/lib/credentials/client";

type Found = { wallet: string; displayName: string; avatarUrl: string | null };

const input = "w-full rounded-md border border-[#B4B8C1] bg-background px-3 py-2 text-sm focus:border-[#00498B] focus:outline-none";

export default function CredentialPeoplePage() {
  const { account, org } = useCredentials();
  const [types, setTypes] = useState<CredentialTypeView[] | null>(null);
  const [typeId, setTypeId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [picked, setPicked] = useState<Found[]>([]);
  const [csv, setCsv] = useState("");
  const [fromMemberList, setFromMemberList] = useState(false);
  const [validUntil, setValidUntil] = useState("");
  const [preview, setPreview] = useState<PeoplePreviewView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ActionView | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void credentialsRequest<CredentialTypeView[]>(account, "org", "types_list", { accountId: org.accountId }).then((r) => {
      if (!r.ok) return setError(r.message);
      const issuable = r.data.filter((t) => t.chainStatus === "onchain" && !t.retired);
      setTypes(issuable);
      setTypeId((cur) => cur || issuable[0]?.typeId || "");
    });
  }, [account, org.accountId]);

  // App users by name; at least 2 letters, debounced.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setFound([]);
    const t = setTimeout(() => {
      void credentialsRequest<Found[]>(account, "org", "people_search", { accountId: org.accountId, query: q }).then((r) => r.ok && setFound(r.data));
    }, 300);
    return () => clearTimeout(t);
  }, [query, account, org.accountId]);

  // Any change to the input invalidates the preview: nothing is prepared that the admin has not seen.
  useEffect(() => setPreview(null), [typeId, picked, csv, fromMemberList, validUntil]);

  const payload = useMemo(() => {
    const p: Record<string, unknown> = { accountId: org.accountId, typeId, client: "dashboard" };
    if (picked.length) p.recipients = picked.map((u) => ({ kind: "account", wallet: u.wallet, displayName: u.displayName }));
    if (csv.trim()) p.csv = csv;
    if (fromMemberList) p.fromMemberList = true;
    if (validUntil) p.validUntil = validUntil;
    return p;
  }, [org.accountId, typeId, picked, csv, fromMemberList, validUntil]);
  const hasInput = picked.length > 0 || csv.trim() !== "" || fromMemberList;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setCsv(await file.text());
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    const r = await credentialsRequest<PeoplePreviewView>(account, "org", "people_preview", payload);
    setBusy(false);
    if (r.ok) setPreview(r.data);
    else setError(r.message);
  }

  async function issue() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    // The admin confirmed the preview, rejected rows included: only the valid rows are issued.
    const r = await credentialsRequest<{ actionId: string; counts: { app: number; link: number } }>(account, "org", "batch_prepare", {
      ...payload,
      dropRejected: preview.rejected.length > 0,
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setPending(freshAction(r.data.actionId, `${r.data.counts.app + r.data.counts.link} Ausweise ausstellen`));
    setPreview(null);
    setPicked([]);
    setCsv("");
    setFromMemberList(false);
  }

  const n = preview ? preview.app + preview.link : 0;

  return (
    <div className="space-y-6">
      {pending && (
        <PendingActionPanel
          action={pending}
          onSettled={() => setReloadKey((k) => k + 1)}
          onClose={() => setPending(null)}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="block max-w-sm space-y-1">
        <span className="text-sm font-medium text-foreground">Ausweis-Typ</span>
        <select className={input} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {(types ?? []).map((t) => (
            <option key={t.typeId} value={t.typeId}>
              {t.name}
            </option>
          ))}
        </select>
        {types !== null && types.length === 0 && (
          <span className="block text-xs text-[#6B7280]">Lege zuerst unter „Ausweis-Typen“ einen Typ an und bestätige ihn auf dem Handy.</span>
        )}
      </label>

      {typeId && (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2 rounded-lg border border-[#B4B8C1] bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Search className="h-4 w-4 text-[#00498B]" aria-hidden /> Personen suchen
              </h2>
              <input className={input} placeholder="Name eingeben" value={query} onChange={(e) => setQuery(e.target.value)} />
              <ul className="space-y-1">
                {found
                  .filter((f) => !picked.some((p) => p.wallet === f.wallet))
                  .map((f) => (
                    <li key={f.wallet}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                        onClick={() => setPicked((p) => [...p, f])}
                      >
                        {f.displayName}
                      </button>
                    </li>
                  ))}
              </ul>
              {picked.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {picked.map((p) => (
                    <span key={p.wallet} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {p.displayName}
                      <button type="button" aria-label={`${p.displayName} entfernen`} onClick={() => setPicked((x) => x.filter((y) => y.wallet !== p.wallet))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-[#B4B8C1] bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Upload className="h-4 w-4 text-[#00498B]" aria-hidden /> Liste einfügen oder hochladen
              </h2>
              <textarea
                className={input}
                rows={5}
                placeholder={"Name;E-Mail\nErika Muster;erika@example.org"}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
              />
              <label className="inline-block cursor-pointer text-sm text-[#00498B] hover:underline">
                .csv-Datei wählen
                <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
              </label>
              <p className="text-xs text-[#6B7280]">Eine Person pro Zeile, Name und optional E-Mail, getrennt durch ; oder ,</p>
            </div>

            <div className="space-y-2 rounded-lg border border-[#B4B8C1] bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4 text-[#00498B]" aria-hidden /> Alle aktuellen Mitglieder
              </h2>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fromMemberList} onChange={(e) => setFromMemberList(e.target.checked)} />
                Alle Mitglieder der Organisation aufnehmen
              </label>
            </div>
          </section>

          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-sm font-medium text-foreground">Gültig bis (optional)</span>
              <input type="date" className={input} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </label>
            <button
              type="button"
              onClick={runPreview}
              disabled={!hasInput || busy}
              className="rounded-md border border-[#00498B] px-4 py-2 text-sm font-medium text-[#00498B] hover:bg-[#00498B]/5 disabled:opacity-50"
            >
              Vorschau
            </button>
          </div>

          {preview && (
            <div className="space-y-3">
              <ImportPreview preview={preview} />
              {n > 0 ? (
                <button
                  type="button"
                  onClick={issue}
                  disabled={busy}
                  className="rounded-md bg-[#00498B] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {n} {n === 1 ? "Ausweis" : "Ausweise"} ausstellen
                </button>
              ) : (
                <p className="text-sm text-[#6B7280]">Niemand Neues in dieser Liste.</p>
              )}
            </div>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Ausgestellt</h2>
            <PeopleTable typeId={typeId} reloadKey={reloadKey} />
          </section>
        </>
      )}
    </div>
  );
}
