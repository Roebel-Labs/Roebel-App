"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Users, ListChecks, Settings } from "lucide-react";
import { useCredentials } from "@/components/credentials/CredentialsContext";
import { PendingActionPanel } from "@/components/credentials/PendingActionPanel";
import { credentialsRequest, isPendingStatus, type ActionView } from "@/lib/credentials/client";

type TypeSummary = { typeId: string; retired: boolean };

export default function CredentialsOverviewPage() {
  const { account, org } = useCredentials();
  const [types, setTypes] = useState<TypeSummary[] | null>(null);
  const [actions, setActions] = useState<ActionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [t, a] = [
        await credentialsRequest<TypeSummary[]>(account, "org", "types_list", { accountId: org.accountId }),
        await credentialsRequest<ActionView[]>(account, "org", "actions_list", { accountId: org.accountId }),
      ];
      if (!alive) return;
      if (t.ok) setTypes(t.data);
      if (a.ok) setActions(a.data);
      if (!t.ok || !a.ok) setError((!t.ok ? t.message : !a.ok ? a.message : null) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [account, org.accountId]);

  const pending = (actions ?? []).filter((a) => isPendingStatus(a.status));
  const cards = [
    { href: "/dashboard/credentials/types", label: "Ausweis-Typen", value: types ? String(types.filter((t) => !t.retired).length) : "…", icon: BadgeCheck },
    { href: "/dashboard/credentials/people", label: "Personen", value: "Ausstellen", icon: Users },
    { href: "/dashboard/credentials/batches", label: "Ausstellungen", value: actions ? String(actions.length) : "…", icon: ListChecks },
    { href: "/dashboard/credentials/settings", label: "Einstellungen", value: org.membersMayBePublic ? "Öffentlich erlaubt" : "Nur privat", icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-lg border border-[#B4B8C1] bg-card p-4 hover:border-[#00498B]">
            <c.icon className="h-4 w-4 text-[#00498B]" aria-hidden />
            <p className="mt-2 text-xs text-[#6B7280]">{c.label}</p>
            <p className="text-base font-semibold text-foreground">{c.value}</p>
          </Link>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Wartet auf Bestätigung</h2>
        {actions === null ? (
          <div className="h-16 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" />
        ) : pending.length === 0 ? (
          <p className="text-sm text-[#6B7280]">Gerade wartet nichts auf eine Bestätigung.</p>
        ) : (
          pending.map((a) => <PendingActionPanel key={a.id} action={a} />)
        )}
      </section>
    </div>
  );
}
