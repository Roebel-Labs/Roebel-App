"use client";

import Link from "next/link";
import { Loader2, Store } from "lucide-react";
import { useAccount } from "@/lib/context/AccountContext";
import { isOrgAccount } from "@/types/account";
import { OrgSidebar } from "@/components/org-dashboard/org-sidebar";

export default function OrgDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { activeAccount, ownedAccounts, isLoading } = useAccount();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeAccount || !isOrgAccount(activeAccount)) {
    const ownedOrgs = ownedAccounts.filter((a) => a.account_type === "organisation");
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
          <Store className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          Organisationskonto erforderlich
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wechsle zu einem Organisationskonto, um das Dashboard zu öffnen.
        </p>
        {ownedOrgs.length > 0 ? (
          <div className="mt-6 space-y-2">
            <p className="text-xs text-muted-foreground">Deine Organisationen:</p>
            {ownedOrgs.map((org) => (
              <SwitchTo key={org.id} accountId={org.id} name={org.name} />
            ))}
          </div>
        ) : (
          <Link
            href="/app/org/create"
            className="inline-block mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            Organisation anlegen
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="md:flex md:items-stretch min-h-[calc(100vh-4rem)]">
      <OrgSidebar account={activeAccount} />
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8 max-w-5xl">
        {children}
      </main>
    </div>
  );
}

function SwitchTo({ accountId, name }: { accountId: string; name: string }) {
  const { switchAccount } = useAccount();
  return (
    <button
      onClick={async () => {
        await switchAccount(accountId);
      }}
      className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-accent text-sm"
    >
      {name}
    </button>
  );
}
