"use client";

import { useCallback, useEffect, useState } from "react";
import { useCredentials } from "./CredentialsContext";
import { PendingActionPanel, freshAction } from "./PendingActionPanel";
import { credentialsRequest, type ActionView } from "@/lib/credentials/client";

/** people_list row (server: PersonView in lib/credentials/people.ts). Never an email or address. */
type PersonView = {
  id: string;
  displayName: string;
  state: "eingeladen" | "angenommen" | "abgelehnt" | "widerrufen" | "abgelaufen";
  public: boolean;
  validUntil: string | null;
  hasLink: boolean;
};

const STATES: PersonView["state"][] = ["eingeladen", "angenommen", "abgelehnt", "widerrufen", "abgelaufen"];
const STATE_LABEL: Record<PersonView["state"], string> = {
  eingeladen: "Eingeladen",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  widerrufen: "Widerrufen",
  abgelaufen: "Abgelaufen",
};
const REVOCABLE: PersonView["state"][] = ["eingeladen", "angenommen", "abgelaufen"];

const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Everyone invited to one type, filterable by state; multi-select "Widerrufen". */
export function PeopleTable({ typeId, reloadKey }: { typeId: string; reloadKey: number }) {
  const { account, org } = useCredentials();
  const [people, setPeople] = useState<PersonView[] | null>(null);
  const [filter, setFilter] = useState<PersonView["state"] | "alle">("alle");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ActionView | null>(null);

  const load = useCallback(async () => {
    const r = await credentialsRequest<PersonView[]>(account, "org", "people_list", { accountId: org.accountId, typeId });
    if (r.ok) setPeople(r.data);
    else setError(r.message);
    setSelected(new Set());
  }, [account, org.accountId, typeId]);

  useEffect(() => {
    setPeople(null);
    void load();
  }, [load, reloadKey]);

  async function revoke() {
    setError(null);
    const r = await credentialsRequest<{ actionId: string }>(account, "org", "revoke_prepare", {
      accountId: org.accountId,
      client: "dashboard",
      invitationIds: [...selected],
    });
    if (!r.ok) return setError(r.message);
    setPending(freshAction(r.data.actionId, "Ausweise widerrufen"));
    setSelected(new Set());
  }

  const shown = (people ?? []).filter((p) => filter === "alle" || p.state === filter);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      {pending && <PendingActionPanel action={pending} onSettled={() => void load()} onClose={() => setPending(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        {(["alle", ...STATES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs ${filter === s ? "border-[#00498B] bg-[#00498B] text-white" : "border-[#B4B8C1] text-[#6B7280] hover:bg-muted"}`}
          >
            {s === "alle" ? "Alle" : STATE_LABEL[s]}
          </button>
        ))}
        {selected.size > 0 && (
          <button type="button" onClick={revoke} className="ml-auto rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
            Widerrufen ({selected.size})
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {people === null ? (
        <div className="h-24 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-[#6B7280]">Niemand in dieser Ansicht.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#B4B8C1]">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-[#6B7280]">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Gültig bis</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="border-t border-[#B4B8C1]">
                  <td className="px-3 py-2">
                    {REVOCABLE.includes(p.state) && (
                      <input type="checkbox" aria-label={`${p.displayName} auswählen`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground">{p.displayName}</td>
                  <td className="px-3 py-2 text-[#6B7280]">
                    {STATE_LABEL[p.state]}
                    {p.public && " · öffentlich"}
                    {p.hasLink && " · Link offen"}
                  </td>
                  <td className="px-3 py-2 text-[#6B7280]">{p.validUntil ? day(p.validUntil) : "Unbefristet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
