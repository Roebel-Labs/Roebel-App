"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCredentials, type CredentialTypeView } from "@/components/credentials/CredentialsContext";
import { PendingActionPanel, freshAction } from "@/components/credentials/PendingActionPanel";
import { TypeFormFields } from "@/components/credentials/TypeFormFields";
import { credentialsRequest, type ActionView } from "@/lib/credentials/client";
import { formFromType, typeFormToPayload, validateTypeForm, type TypeForm } from "@/lib/credentials/type-form";

const RETIRE_WARNING = "Alle Ausweise dieses Typs verlieren sofort ihre Gültigkeit. Das kann nicht rückgängig gemacht werden.";

export default function CredentialTypeDetailPage() {
  const { typeId } = useParams<{ typeId: string }>();
  const { account, org } = useCredentials();
  const [type, setType] = useState<CredentialTypeView | null | undefined>(undefined);
  const [form, setForm] = useState<TypeForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [pending, setPending] = useState<ActionView | null>(null);

  const load = useCallback(async () => {
    const r = await credentialsRequest<CredentialTypeView[]>(account, "org", "types_list", { accountId: org.accountId });
    if (!r.ok) return setError(r.message);
    const t = r.data.find((x) => x.typeId.toLowerCase() === String(typeId).toLowerCase()) ?? null;
    setType(t);
    if (t) setForm(formFromType(t));
  }, [account, org.accountId, typeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form || !type) return;
    const e = validateTypeForm(form);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const r = await credentialsRequest<{ actionId: string | null }>(account, "org", "type_prepare", {
      accountId: org.accountId,
      client: "dashboard",
      ...typeFormToPayload(form, "update", type.typeId),
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    // A text-only change needs no confirmation (the card text lives on this server).
    if (r.data.actionId) setPending(freshAction(r.data.actionId, `Ausweis „${form.name.trim()}“ ändern`));
    else setNotice("Gespeichert.");
    void load();
  }

  async function retire() {
    if (!type) return;
    setConfirmRetire(false);
    setBusy(true);
    setError(null);
    const r = await credentialsRequest<{ actionId: string }>(account, "org", "type_prepare", {
      accountId: org.accountId,
      client: "dashboard",
      op: "retire",
      typeId: type.typeId,
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setPending(freshAction(r.data.actionId, `Ausweis „${type.name}“ nicht mehr ausgeben`));
  }

  const editable = type && type.chainStatus === "onchain" && !type.retired;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/credentials/types" className="inline-flex items-center gap-1 text-sm text-[#00498B] hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Alle Ausweis-Typen
      </Link>
      {pending && <PendingActionPanel action={pending} onSettled={() => void load()} onClose={() => setPending(null)} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {type === undefined ? (
        <div className="h-40 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" />
      ) : type === null ? (
        <p className="text-sm text-[#6B7280]">Diesen Ausweis-Typ gibt es nicht.</p>
      ) : (
        <section className="space-y-4 rounded-lg border border-[#B4B8C1] bg-card p-4">
          <h2 className="text-base font-semibold text-foreground">{type.name}</h2>
          {type.chainStatus === "draft" && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Noch nicht bestätigt. Sobald die Bestätigung auf dem Handy eingetragen ist, kannst du den Typ bearbeiten.
            </p>
          )}
          {type.retired && <p className="rounded-md bg-muted px-3 py-2 text-sm text-[#6B7280]">Dieser Typ ist stillgelegt.</p>}
          {form && editable && (
            <>
              <TypeFormFields form={form} onChange={setForm} errors={errors} mode="update" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="rounded-md bg-[#00498B] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRetire(true)}
                  disabled={busy}
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Stilllegen
                </button>
              </div>
            </>
          )}
          {confirmRetire && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3" role="alertdialog" aria-label="Stilllegen bestätigen">
              <p className="text-sm text-red-800">{RETIRE_WARNING}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={retire} className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white">
                  Stilllegen
                </button>
                <button type="button" onClick={() => setConfirmRetire(false)} className="rounded-md px-3 py-1.5 text-sm text-[#6B7280] hover:bg-muted">
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
