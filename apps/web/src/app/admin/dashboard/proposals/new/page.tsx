"use client";

export const dynamic = "force-dynamic";

import { CreateProposalForm } from "@/components/proposals/CreateProposalForm";

export default function AdminCreateProposalPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-medium">Vorschlag erstellen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reiche einen neuen Governance-Vorschlag mit verschlüsselter MACI-Abstimmung ein.
        </p>
      </div>

      <CreateProposalForm
        redirectTo="/admin/dashboard/dao"
        cancelHref="/admin/dashboard/dao"
      />
    </div>
  );
}
