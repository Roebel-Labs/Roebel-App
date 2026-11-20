"use client";

import { ShieldAlert } from "lucide-react";

export type OrgGateState = "ready" | "org_not_registered" | "no_chain_authority" | "forbidden" | "not_enabled" | "signed_out";

/** The two 409 texts of the server (lib/credentials/actions.ts) plus the dashboard-only states. */
export const ORG_GATE_TEXT: Record<Exclude<OrgGateState, "ready">, { title: string; body: string }> = {
  org_not_registered: {
    title: "Noch nicht im Register",
    body: "Diese Organisation ist noch nicht im öffentlichen Register eingetragen.",
  },
  no_chain_authority: {
    title: "Noch nicht berechtigt",
    body: "Dein Konto ist für diese Organisation noch nicht im Register berechtigt. Öffne in der App Organisation → Einstellungen → Onchain-Organisation und gleiche die Rollen ab.",
  },
  forbidden: {
    title: "Keine Berechtigung",
    body: "Nur Inhaber:innen und Admins können Ausweise verwalten.",
  },
  not_enabled: {
    title: "Ausweise sind noch nicht freigeschaltet",
    body: "Das Ausweis-Register ist auf diesem Server noch nicht eingeschaltet.",
  },
  signed_out: {
    title: "Bitte anmelden",
    body: "Melde dich mit deinem Konto an, um Ausweise zu verwalten.",
  },
};

/** One explanation card instead of a form that would fail at confirmation time. Renders nothing when ready. */
export function OrgGateCard({ state }: { state: OrgGateState }) {
  if (state === "ready") return null;
  const t = ORG_GATE_TEXT[state];
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-[#B4B8C1] bg-card p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <ShieldAlert className="h-5 w-5 text-[#00498B]" aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-foreground">{t.title}</h2>
      <p className="mt-1 text-sm text-[#6B7280]">{t.body}</p>
    </div>
  );
}
