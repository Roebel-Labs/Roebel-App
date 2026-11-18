"use client";

import { useCallback, useEffect, useState } from "react";
import { useCredentials, type CredentialTypeView } from "@/components/credentials/CredentialsContext";
import { PendingActionPanel, freshAction } from "@/components/credentials/PendingActionPanel";
import { credentialsRequest, type ActionView } from "@/lib/credentials/client";
import type { DelegateListRow } from "@/lib/credentials/actions";
import { delegateRows } from "@/lib/credentials/views";

type DelegatesData = { delegates: DelegateListRow[]; members: { wallet: string; displayName: string }[] };

const input = "w-full rounded-md border border-[#B4B8C1] bg-background px-3 py-2 text-sm focus:border-[#00498B] focus:outline-none";

export default function CredentialSettingsPage() {
  const { account, org, refreshOrg } = useCredentials();
  const [data, setData] = useState<DelegatesData | null>(null);
  const [types, setTypes] = useState<CredentialTypeView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ActionView | null>(null);
  const [adding, setAdding] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [member, setMember] = useState("");

  const load = useCallback(async () => {
    const [d, t] = [
      await credentialsRequest<DelegatesData>(account, "org", "delegates_list", { accountId: org.accountId }),
      await credentialsRequest<CredentialTypeView[]>(account, "org", "types_list", { accountId: org.accountId }),
    ];
    if (d.ok) setData(d.data);
    else setError(d.message);
    if (t.ok) {
      const onchain = t.data.filter((x) => x.chainStatus === "onchain" && !x.retired);
      setTypes(onchain);
      setTypeId((cur) => cur || onchain[0]?.typeId || "");
    }
  }, [account, org.accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function prepare(action: "members_public_prepare" | "delegate_prepare", payload: Record<string, unknown>, title: string) {
    setBusy(true);
    setError(null);
    const r = await credentialsRequest<{ actionId: string }>(account, "org", action, { accountId: org.accountId, client: "dashboard", ...payload });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setPending(freshAction(r.data.actionId, title));
  }

  const rows = data ? delegateRows(data.delegates) : [];
  const memberName = data?.members.find((m) => m.wallet === member)?.displayName;

  return (
    <div className="space-y-6">
      {pending && (
        <PendingActionPanel
          action={pending}
          onSettled={() => {
            void refreshOrg();
            void load();
          }}
          onClose={() => setPending(null)}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-lg border border-[#B4B8C1] bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Mitglieder dürfen öffentlich sichtbar sein</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Aus: Mitgliedschaften können nur privat gehalten werden. Ämter bleiben immer öffentlich.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={org.membersMayBePublic}
            aria-label="Mitglieder dürfen öffentlich sichtbar sein"
            disabled={busy}
            onClick={() =>
              prepare(
                "members_public_prepare",
                { membersPublic: !org.membersMayBePublic },
                org.membersMayBePublic ? "Mitglieder nur noch privat" : "Mitglieder dürfen öffentlich sichtbar sein",
              )
            }
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${org.membersMayBePublic ? "bg-[#00498B]" : "bg-[#B4B8C1]"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${org.membersMayBePublic ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-[#B4B8C1] bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Berechtigte Konten</h2>
        <p className="text-sm text-[#6B7280]">Diese Konten dürfen einen Ausweis-Typ in eurem Namen ausstellen und widerrufen, sonst nichts.</p>
        {data === null ? (
          <div className="h-12 animate-pulse rounded-md bg-muted" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-[#6B7280]">Noch keine berechtigten Konten.</p>
        ) : (
          <ul className="divide-y divide-[#B4B8C1] rounded-md border border-[#B4B8C1]">
            {rows.map((r, i) => {
              const raw = data.delegates[i];
              return (
                <li key={`${raw.typeId}:${raw.delegate}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{r.who}</p>
                    <p className="text-xs text-[#6B7280]">{r.typeName}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => prepare("delegate_prepare", { typeId: raw.typeId, delegate: raw.delegate, allowed: false }, `Berechtigung entziehen: ${r.who}`)}
                    className="rounded-md border border-[#B4B8C1] px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Entziehen
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {adding ? (
          <div className="space-y-3 rounded-md border border-[#B4B8C1] p-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">Ausweis-Typ</span>
              <select className={input} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.typeId} value={t.typeId}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">Mitglied</span>
              <select className={input} value={member} onChange={(e) => setMember(e.target.value)}>
                <option value="">Bitte wählen</option>
                {(data?.members ?? []).map((m) => (
                  <option key={m.wallet} value={m.wallet}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !typeId || !member}
                onClick={() => {
                  setAdding(false);
                  void prepare("delegate_prepare", { typeId, delegate: member, allowed: true, label: "Türscanner" }, `Türscanner-Konto berechtigen: ${memberName ?? ""}`);
                }}
                className="rounded-md bg-[#00498B] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Berechtigen
              </button>
              <button type="button" onClick={() => setAdding(false)} className="rounded-md px-4 py-2 text-sm text-[#6B7280] hover:bg-muted">
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={types.length === 0}
            onClick={() => setAdding(true)}
            className="rounded-md border border-[#00498B] px-4 py-2 text-sm font-medium text-[#00498B] hover:bg-[#00498B]/5 disabled:opacity-50"
          >
            Türscanner-Konto berechtigen
          </button>
        )}
      </section>
    </div>
  );
}
