"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Loader2, Store, ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/app/AuthGuard";
import { AccountProvider, useAccount } from "@/lib/context/AccountContext";
import { isOrgAccount } from "@/types/account";
import { OrgSidebar } from "@/components/org-dashboard/org-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AccountProvider>
        <DashboardShell>{children}</DashboardShell>
      </AccountProvider>
    </AuthGuard>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { activeAccount, ownedAccounts, isLoading, switchAccount } = useAccount();
  const pathname = usePathname();
  // The Netizen Mini App builder is open to ANY signed-in user — external
  // developers (e.g. from other towns) build mini apps here and don't have a
  // Röbel organisation account. Exempt it from the org-account gate below;
  // AuthGuard still requires a connected wallet.
  const isMiniAppBuilder = pathname?.startsWith("/dashboard/mini-apps") ?? false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isMiniAppBuilder) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <DashboardTopBar />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    );
  }

  if (!activeAccount || !isOrgAccount(activeAccount)) {
    const ownedOrgs = ownedAccounts.filter((a) => a.account_type === "organisation");
    return (
      <div className="min-h-screen bg-background">
        <DashboardTopBar />
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
                <button
                  key={org.id}
                  onClick={async () => {
                    await switchAccount(org.id);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-accent text-sm"
                >
                  {org.name}
                </button>
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
          <Link
            href="/app"
            className="block mt-6 text-xs text-muted-foreground hover:text-foreground"
          >
            ← Zurück zur App
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardTopBar />
      <div className="flex-1 md:flex md:items-stretch">
        <OrgSidebar account={activeAccount} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 max-w-6xl w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

function DashboardTopBar() {
  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      <Link href="/app" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <Image
          src="/Logo-new.png"
          alt="Röbel App"
          width={105}
          height={24}
          className="h-6 w-auto object-contain"
        />
        <span className="text-xs text-muted-foreground hidden sm:inline">· Dashboard</span>
      </Link>
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zur App
      </Link>
    </header>
  );
}
