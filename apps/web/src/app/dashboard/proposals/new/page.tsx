"use client";

export const dynamic = "force-dynamic";

import { useAccount } from "@/lib/context/AccountContext";
import { subTypeFeatures } from "@/types/account";
import { CreateProposalForm } from "@/components/proposals/CreateProposalForm";

export default function DashboardCreateProposalPage() {
  const { activeAccount } = useAccount();

  if (!activeAccount) return null;

  const canWrite = subTypeFeatures(activeAccount.sub_type).proposals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">Vorschlag erstellen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reiche einen neuen Governance-Vorschlag mit verschlüsselter MACI-Abstimmung ein.
        </p>
      </div>

      {!canWrite ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200">
          Das Erstellen von Vorschlägen ist aktuell nur für das Stadt-Konto verfügbar.
        </div>
      ) : (
        <CreateProposalForm
          redirectTo="/app/proposals"
          cancelHref="/app/proposals"
        />
      )}
    </div>
  );
}
