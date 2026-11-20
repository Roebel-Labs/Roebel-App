"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Plus } from "lucide-react";
import { useCredentials, type CredentialTypeView } from "@/components/credentials/CredentialsContext";
import { PendingActionPanel, freshAction } from "@/components/credentials/PendingActionPanel";
import { TypeFormFields } from "@/components/credentials/TypeFormFields";
import { credentialsRequest, type ActionView } from "@/lib/credentials/client";
import { blankForm, formFromTemplate, KIND_LABELS, TEMPLATE_CHOICES, typeFormToPayload, validateTypeForm, type TypeForm } from "@/lib/credentials/type-form";

export default function CredentialTypesPage() {
  const { account, org } = useCredentials();
  const [types, setTypes] = useState<CredentialTypeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TypeForm | null>(null);
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ActionView | null>(null);

  const load = useCallback(async () => {
    const r = await credentialsRequest<CredentialTypeView[]>(account, "org", "types_list", { accountId: org.accountId });
    if (r.ok) setTypes(r.data);
    else setError(r.message);
  }, [account, org.accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  function pick(key: TypeForm["template"]) {
    setPicking(false);
    setErrors({});
    setForm(key === "eigener" ? blankForm() : formFromTemplate(key));
  }

  async function submit() {
    if (!form) return;
    const e = validateTypeForm(form);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setError(null);
    const r = await credentialsRequest<{ actionId: string; typeId: string }>(account, "org", "type_prepare", {
      accountId: org.accountId,
      client: "dashboard",
      ...typeFormToPayload(form, "create"),
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setPending(freshAction(r.data.actionId, `Ausweis „${form.name.trim()}“ anlegen`));
    setForm(null);
    void load();
  }

  return (
    <div className="space-y-6">
      {pending && <PendingActionPanel action={pending} onSettled={() => void load()} onClose={() => setPending(null)} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {form ? (
        <section className="space-y-4 rounded-lg border border-[#B4B8C1] bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Neuer Ausweis-Typ</h2>
          <TypeFormFields form={form} onChange={setForm} errors={errors} mode="create" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded-md bg-[#00498B] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Anlegen und auf dem Handy bestätigen
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded-md px-4 py-2 text-sm text-[#6B7280] hover:bg-muted">
              Abbrechen
            </button>
          </div>
        </section>
      ) : picking ? (
        <section className="space-y-3 rounded-lg border border-[#B4B8C1] bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Vorlage wählen</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMPLATE_CHOICES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => pick(t.key)}
                className="rounded-md border border-[#B4B8C1] px-3 py-3 text-left text-sm font-medium hover:border-[#00498B]"
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#00498B] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden /> Neuer Ausweis-Typ
        </button>
      )}

      <section className="space-y-2">
        {types === null ? (
          <div className="h-20 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" />
        ) : types.length === 0 ? (
          <p className="text-sm text-[#6B7280]">Noch keine Ausweis-Typen. Lege mit einer Vorlage den ersten an.</p>
        ) : (
          types.map((t) => (
            <Link
              key={t.typeId}
              href={`/dashboard/credentials/types/${t.typeId}`}
              className={`flex items-center gap-3 rounded-lg border border-[#B4B8C1] bg-card p-3 hover:border-[#00498B] ${t.retired ? "opacity-60" : ""}`}
            >
              {t.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.imageUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                  <BadgeCheck className="h-5 w-5 text-[#00498B]" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
                  {t.kind && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-[#6B7280]">{KIND_LABELS[t.kind]}</span>}
                  {t.recognised && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#00498B]/10 px-2 py-0.5 text-[11px] font-medium text-[#00498B]">
                      <BadgeCheck className="h-3 w-3" aria-hidden /> Anerkannt
                    </span>
                  )}
                  {t.chainStatus === "draft" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Noch nicht bestätigt</span>
                  )}
                  {t.retired && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-[#6B7280]">Stillgelegt</span>}
                </div>
                <p className="text-xs text-[#6B7280]">
                  {t.counts?.accepted ?? 0} angenommen · {t.counts?.open ?? 0} offen
                </p>
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
