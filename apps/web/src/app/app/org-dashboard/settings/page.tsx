"use client";

import Link from "next/link";
import { useAccount } from "@/lib/context/AccountContext";

export default function OrgSettingsPage() {
  const { activeAccount } = useAccount();
  if (!activeAccount) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-medium">Einstellungen</h1>
      </div>

      <section className="bg-card border border-border rounded-[10px] p-6 space-y-3">
        <h2 className="font-semibold">Konto-Status</h2>
        <Row label="Typ" value={activeAccount.account_type} />
        <Row label="Sub-Typ" value={activeAccount.sub_type ?? "—"} />
        <Row label="Slug" value={activeAccount.slug ?? "—"} />
        <Row label="Verifiziert" value={activeAccount.is_verified ? "Ja" : "Nein"} />
        <Row
          label="Extern"
          value={
            activeAccount.is_extern
              ? `Ja · ${activeAccount.extern_status ?? "pending"}`
              : "Nein"
          }
        />
        {activeAccount.contact_email && (
          <Row label="Kontakt-E-Mail" value={activeAccount.contact_email} />
        )}
      </section>

      <section className="bg-card border border-border rounded-[10px] p-6 space-y-3">
        <h2 className="font-semibold">Verlassen</h2>
        <p className="text-sm text-muted-foreground">
          Du kannst die Organisation in der Mitglieder-Verwaltung verlassen,
          solange du nicht der einzige Inhaber bist.
        </p>
        <Link
          href="/app/org-dashboard/members"
          className="text-sm text-primary underline"
        >
          Zur Mitglieder-Verwaltung →
        </Link>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground truncate">
        {value}
      </span>
    </div>
  );
}
